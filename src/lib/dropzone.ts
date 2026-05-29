import { z } from "zod";

export const DOCUMENT_UPLOAD_ACCEPTED_LABEL = "PDF, JPEG, PNG or WebP";
export const DOCUMENT_UPLOAD_MAX_MB = 10;
export const DOCUMENT_UPLOAD_MAX_SIZE = DOCUMENT_UPLOAD_MAX_MB * 1024 * 1024;
export const DOCUMENT_UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const documentUploadSchema = z
  .custom<File>((val) => val instanceof File, "File is required.")
  .refine((file) => file.size <= DOCUMENT_UPLOAD_MAX_SIZE, {
    message: `File size must be less than ${DOCUMENT_UPLOAD_MAX_MB}MB.`,
  })
  .refine((file) => Object.keys(DOCUMENT_UPLOAD_ACCEPT).includes(file.type), {
    message: "Invalid file type. Please upload a supported document format.",
  });

export const defaultDocumentDropzoneValidation = {
  accept: DOCUMENT_UPLOAD_ACCEPT,
  maxFiles: 1,
  maxSize: DOCUMENT_UPLOAD_MAX_SIZE,
} as const;

/**
 * Normalizes a file returned by react-dropzone.
 * React-dropzone's underlying file-selector can attach FileSystemFileHandle bindings 
 * to File objects. This causes a NotAllowedError in Chromium when the file is read 
 * asynchronously during fetch() or FormData processing. 
 * This helper eagerly reads the file into a memory buffer to create a clean, 
 * standard File object that is completely safe for async network requests.
 */
export async function normalizeDropzoneFile(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  return new File([buffer], file.name, {
    type: file.type,
  });
}
