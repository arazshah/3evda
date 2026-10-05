import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the panel journey leaves the owner's authenticator secret for the specs that sign in later (CI only). */
export const OWNER_TOTP_FILE = join(tmpdir(), "e2e-owner-totp.txt");
