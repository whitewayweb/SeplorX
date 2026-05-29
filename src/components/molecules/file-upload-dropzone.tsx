"use client";

import { FileText, RotateCcw, X } from "lucide-react";

import {
  Dropzone,
  DropZoneArea,
  DropzoneDescription,
  DropzoneFileList,
  DropzoneFileListItem,
  DropzoneFileMessage,
  DropzoneMessage,
  DropzoneRemoveFile,
  DropzoneRetryFile,
  DropzoneTrigger,
  InfiniteProgress,
  useDropzone,
} from "@/components/ui/dropzone";
import {
  DOCUMENT_UPLOAD_ACCEPTED_LABEL,
  DOCUMENT_UPLOAD_MAX_MB,
} from "@/lib/dropzone";

interface FileUploadDropzoneProps<TUploadRes, TUploadError> {
  dropzone: ReturnType<typeof useDropzone<TUploadRes, TUploadError>>;
  description?: string;
  showRetry?: boolean;
  title: string;
}

export function FileUploadDropzone<TUploadRes, TUploadError>({
  description = `${DOCUMENT_UPLOAD_ACCEPTED_LABEL} · max ${DOCUMENT_UPLOAD_MAX_MB} MB`,
  dropzone,
  showRetry = false,
  title,
}: FileUploadDropzoneProps<TUploadRes, TUploadError>) {
  return (
    <Dropzone {...dropzone}>
      <DropzoneDescription>{description}</DropzoneDescription>
      <DropzoneMessage />
      <DropZoneArea className="min-h-48 flex-col gap-3 border-2 border-dashed px-6 py-10 text-center">
        <DropzoneTrigger className="flex flex-col items-center gap-3 bg-transparent p-0 hover:bg-transparent">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </DropzoneTrigger>
        <DropzoneFileList className="w-full">
          {dropzone.fileStatuses.map((fileStatus) => (
            <DropzoneFileListItem key={fileStatus.id} file={fileStatus}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex-1 min-w-0 truncate text-left text-sm font-medium">{fileStatus.fileName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {showRetry && dropzone.canRetry(fileStatus.id) ? (
                    <DropzoneRetryFile variant="ghost" size="icon-sm">
                      <RotateCcw className="h-4 w-4" />
                    </DropzoneRetryFile>
                  ) : null}
                  <DropzoneRemoveFile variant="ghost" size="icon-sm">
                    <X className="h-4 w-4" />
                  </DropzoneRemoveFile>
                </div>
              </div>
              <DropzoneFileMessage />
              <InfiniteProgress status={fileStatus.status} />
            </DropzoneFileListItem>
          ))}
        </DropzoneFileList>
      </DropZoneArea>
    </Dropzone>
  );
}
