"use client";

import { IMAGE_SPEC_ORDER, IMAGE_SPECS, sizeLabel, UPLOAD_LIMITS } from "@/lib/image-specs";
import { Card } from "./ui";

/** Every picture slot of the site with its exact recommended size (the same table the picker hints come from). */
export function ImageGuide() {
  return (
    <Card>
      <section aria-labelledby="image-guide-title" id="image-guide" className="flex flex-col gap-4">
        <div>
          <h2 id="image-guide-title" className="font-display text-2xl">
            راهنمای اندازه‌ی تصاویر
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            برای بهترین کیفیت، عکس را با همین اندازه (یا بزرگ‌تر و با همین نسبت) آپلود کنید. سیستم خودش
            نسخه‌های ۴۸۰، ۹۶۰، ۱۶۰۰ و ۲۴۰۰ پیکسلی با فرمت‌های سبک می‌سازد و اصل فایل را دست‌نخورده نگه
            می‌دارد. هر فایل {UPLOAD_LIMITS} است. اگر نسبت عکس با جدول فرق کند، سایت آن را از وسط می‌برد؛ پس
            سوژه را وسط بگذارید.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-start text-sm">
            <caption className="sr-only">اندازه‌ی پیشنهادی هر تصویر</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 text-start font-normal">
                  تصویر
                </th>
                <th scope="col" className="py-2 text-start font-normal">
                  اندازه‌ی دقیق
                </th>
                <th scope="col" className="py-2 text-start font-normal">
                  نسبت
                </th>
                <th scope="col" className="py-2 text-start font-normal">
                  قالب
                </th>
                <th scope="col" className="py-2 text-start font-normal">
                  کجا دیده می‌شود و نکته
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {IMAGE_SPEC_ORDER.map((key) => {
                const spec = IMAGE_SPECS[key];
                return (
                  <tr key={key}>
                    <th scope="row" className="py-3 pe-3 text-start font-semibold">
                      {spec.title}
                    </th>
                    <td className="whitespace-nowrap py-3 pe-3">
                      <bdi dir="ltr" className="font-semibold tabular-nums">
                        {sizeLabel(spec)}
                      </bdi>
                    </td>
                    <td className="py-3 pe-3">{spec.ratio}</td>
                    <td className="py-3 pe-3">{spec.format}</td>
                    <td className="py-3 text-muted">
                      {spec.where}. {spec.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          عکس‌های گالری مشتری محدودیت ابعاد ندارند (تا ۱۵۰ مگاپیکسل)؛ پیش‌نمایش و تصویر کوچک خودکار ساخته
          می‌شود و اصل فایل برای تحویل می‌ماند.
        </p>
      </section>
    </Card>
  );
}
