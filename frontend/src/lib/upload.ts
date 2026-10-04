import { readCookie, type ApiError, type MediaAsset } from "./api/client";

export type UploadResult = { asset: MediaAsset; duplicate: boolean };

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadMedia(file: File, onProgress: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media/");
    xhr.withCredentials = true;
    const token = readCookie("csrftoken");
    if (token) xhr.setRequestHeader("X-CSRFToken", decodeURIComponent(token));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page (e.g. the gateway's body-size limit)
      }
      if (xhr.status === 200 || xhr.status === 201) {
        resolve({ asset: body as MediaAsset, duplicate: xhr.status === 200 });
      } else if (xhr.status === 413) {
        reject({ code: "too_large", detail: "حجم فایل از حد مجاز بیشتر است." } satisfies ApiError);
      } else {
        reject((body as ApiError | null) ?? { code: "http_error", detail: `خطای ${xhr.status}` });
      }
    };
    xhr.onerror = () => reject({ code: "network", detail: "ارتباط با سرور قطع شد." } satisfies ApiError);
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** Upload one file (field `file`) to an admin endpoint, with progress. Resolves with the JSON the server answers. */
export function uploadTo<T>(url: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    const token = readCookie("csrftoken");
    if (token) xhr.setRequestHeader("X-CSRFToken", decodeURIComponent(token));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // not JSON (the gateway's size limit answers with a page)
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (xhr.status === 413)
        reject({ code: "too_large", detail: "حجم فایل از حد مجاز بیشتر است." } satisfies ApiError);
      else reject((body as ApiError | null) ?? { code: "http_error", detail: `خطای ${xhr.status}` });
    };
    xhr.onerror = () => reject({ code: "network", detail: "ارتباط با سرور قطع شد." } satisfies ApiError);
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
