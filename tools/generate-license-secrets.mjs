import { randomBytes } from "node:crypto";

console.log("LICENSE_HASH_SECRET=" + randomBytes(32).toString("base64"));
console.log("LICENSE_ENCRYPTION_KEY=" + randomBytes(32).toString("base64"));
