#!/bin/sh
# Restores the database and both buckets from a backup snapshot.
#
#   restore            list the snapshots
#   restore latest     restore the newest one          (asks for confirmation)
#   restore <id>       restore a specific one
#   restore <id> --yes skip the question (the restore drill uses this)
#
# Run it in the `backup` service's terminal in Coolify, with the `api` and `worker` services STOPPED.
set -eu

say() { printf '%s\n' "$*"; }
die() { say "✗ $*" >&2; exit 1; }

[ -n "${RESTIC_PASSWORD:-}" ] || die "RESTIC_PASSWORD تنظیم نشده است."
export RESTIC_REPOSITORY="${BACKUP_REPOSITORY:-/backups/repo}"
WORK="${BACKUP_WORKDIR:-/backups/work}-restore"

export PGHOST="${POSTGRES_HOST:-postgres}" PGPORT="${POSTGRES_PORT:-5432}" PGUSER="${POSTGRES_USER:-threevda}"
export PGPASSWORD="${POSTGRES_PASSWORD:?}"
DB="${POSTGRES_DB:-threevda}"

export RCLONE_CONFIG_STORE_TYPE=s3 RCLONE_CONFIG_STORE_PROVIDER=Other
export RCLONE_CONFIG_STORE_ENDPOINT="${S3_ENDPOINT_URL:-http://storage:8333}"
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="${S3_ACCESS_KEY:?}" RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="${S3_SECRET_KEY:?}"
export RCLONE_CONFIG_STORE_REGION="${S3_REGION:-us-east-1}"

# An off-server repository: map the credentials and write the ssh key, exactly as the nightly backup does.
[ -z "${BACKUP_S3_ACCESS_KEY:-}" ] || export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
[ -z "${BACKUP_S3_SECRET_KEY:-}" ] || export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
[ -z "${BACKUP_S3_REGION:-}" ] || export AWS_DEFAULT_REGION="$BACKUP_S3_REGION"
python /app/manage.py run_backup --prepare-ssh || die "اتصال به مقصد بکاپ آماده نشد."

restic cat config >/dev/null 2>&1 || die "مخزن پشتیبان در «$RESTIC_REPOSITORY» پیدا نشد یا رمز آن درست نیست. هیچ چیزی تغییر نکرد."

SNAPSHOT="${1:-}"
if [ -z "$SNAPSHOT" ]; then
  say "نسخه‌های پشتیبان موجود (تازه‌ترین در پایین):"
  restic snapshots --tag nightly
  say ""
  say "برای بازگردانی: restore latest   یا   restore <شناسه>"
  exit 0
fi
YES="${2:-}"

say "۱) بررسی نسخه‌ی انتخاب‌شده…"
restic snapshots --tag nightly "$SNAPSHOT" || die "این نسخه پیدا نشد."
restic stats --mode restore-size "$SNAPSHOT" || true

say "۲) بررسی اینکه api و worker خاموش‌اند…"
CLIENTS="$(psql -d postgres -tAc "select count(*) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid() and backend_type = 'client backend'")"
if [ "$CLIENTS" != "0" ]; then
  die "$CLIENTS اتصال دیگر به پایگاه‌داده باز است. ابتدا سرویس‌های api و worker را در Coolify متوقف کنید و دوباره امتحان کنید. هیچ چیزی تغییر نکرد."
fi

say ""
say "هشدار: پایگاه‌داده و فایل‌های فعلی سایت با محتوای همین نسخه جایگزین می‌شوند و آنچه بعد از آن ثبت شده از بین می‌رود."
if [ "$YES" != "--yes" ]; then
  printf 'برای ادامه عبارت yes را بنویسید: '
  read -r answer
  [ "$answer" = "yes" ] || die "لغو شد. هیچ چیزی تغییر نکرد."
fi

say "۳) خواندن نسخه از مخزن…"
rm -rf "$WORK"
mkdir -p "$WORK"
restic restore "$SNAPSHOT" --target "$WORK" >/dev/null
SRC="$(find "$WORK" -name db.dump -print -quit | xargs -r dirname)"
[ -n "$SRC" ] && [ -f "$SRC/db.dump" ] || die "فایل db.dump در این نسخه نیست. هیچ چیزی تغییر نکرد."

say "۴) بازگرداندن پایگاه‌داده…"
psql -d postgres -qc "drop database if exists \"$DB\""
psql -d postgres -qc "create database \"$DB\""
pg_restore --no-owner --dbname "$DB" "$SRC/db.dump"

say "۵) بازگرداندن فایل‌ها…"
for dir in "$SRC"/objects/*; do
  [ -d "$dir" ] || continue
  bucket="$(basename "$dir")"
  rclone mkdir "store:$bucket"
  rclone sync "$dir" "store:$bucket" --exclude "_system/**"
done

say "۶) در صف گذاشتن دوباره‌ی کارهای نیمه‌تمام (صف کارها جزو بکاپ نیست)…"
python /app/manage.py requeue_pending || say "هشدار: صف دوباره ساخته نشد؛ پس از روشن‌شدن worker دستور «python manage.py requeue_pending» را اجرا کنید."

rm -rf "$WORK"
say ""
say "✓ بازگرداندن تمام شد. اکنون سرویس‌های api و worker را در Coolify روشن کنید؛ api خودش مهاجرت‌ها را اجرا می‌کند."
