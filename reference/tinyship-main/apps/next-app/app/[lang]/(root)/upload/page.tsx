'use client';

import * as React from 'react';
import { Upload, X, Cloud, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@libs/react-shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libs/react-shared/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@libs/react-shared/ui/select';
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
} from '@libs/react-shared/ui/file-upload';

type StorageProvider = 'oss' | 's3' | 'r2' | 'cos';

// Maximum file size: 1MB
const MAX_FILE_SIZE = 1 * 1024 * 1024;
// Maximum files allowed
const MAX_FILES = 1;

interface UploadedFile {
  file: File;
  key: string;
  url: string;
  provider: StorageProvider;
}

export default function UploadPage() {
  const { t } = useTranslation();
  const [files, setFiles] = React.useState<File[]>([]);
  const [provider, setProvider] = React.useState<StorageProvider>('oss');
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);

  const providerOptions = [
    {
      value: 'oss' as const,
      label: t.upload.providers.oss,
      description: t.upload.providers.ossDescription,
      icon: <Cloud className="size-4 text-chart-1" />,
    },
    {
      value: 's3' as const,
      label: t.upload.providers.s3,
      description: t.upload.providers.s3Description,
      icon: <Cloud className="size-4 text-chart-1" />,
    },
    {
      value: 'r2' as const,
      label: t.upload.providers.r2,
      description: t.upload.providers.r2Description,
      icon: <Cloud className="size-4 text-chart-1" />,
    },
    {
      value: 'cos' as const,
      label: t.upload.providers.cos,
      description: t.upload.providers.cosDescription,
      icon: <Cloud className="size-4 text-chart-1" />,
    },
  ];

  const onFileValidate = React.useCallback(
    (file: File): string | null => {
      // Validate max files
      if (files.length >= MAX_FILES) {
        return t.upload.errors.maxFiles;
      }

      // Validate file type (only images)
      if (!file.type.startsWith('image/')) {
        return t.upload.errors.imageOnly;
      }

      // Validate file size (max 1MB)
      if (file.size > MAX_FILE_SIZE) {
        return t.upload.errors.fileTooLarge;
      }

      return null;
    },
    [files, t],
  );

  const onFileReject = React.useCallback((file: File, message: string) => {
    toast.error(message, {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}"`,
    });
  }, []);

  const uploadSingleFile = async (
    file: File,
    onProgress: (file: File, progress: number) => void,
    onSuccess: (file: File) => void,
    onError: (file: File, error: Error) => void,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider', provider);

    try {
      // Using XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(file, progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success) {
                setUploadedFiles((prev) => [
                  ...prev,
                  {
                    file,
                    key: response.data.key,
                    url: response.data.url,
                    provider: response.data.provider,
                  },
                ]);
                onSuccess(file);
                resolve();
              } else {
                reject(new Error(response.error || 'Upload failed'));
              }
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error occurred'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was cancelled'));
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      });
    } catch (error) {
      onError(file, error instanceof Error ? error : new Error('Upload failed'));
    }
  };

  const onUpload = async (
    files: File[],
    options: {
      onProgress: (file: File, progress: number) => void;
      onSuccess: (file: File) => void;
      onError: (file: File, error: Error) => void;
    },
  ) => {
    setIsUploading(true);
    
    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const file of files) {
        await uploadSingleFile(file, options.onProgress, options.onSuccess, options.onError);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Handle files change - clean up uploaded files for removed files
  const handleFilesChange = React.useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    // Clean up uploaded files for removed files
    setUploadedFiles((prev) => prev.filter((uf) => newFiles.includes(uf.file)));
  }, []);

  const handleClearAll = () => {
    setFiles([]);
    setUploadedFiles([]);
  };

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {t.upload.title}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t.upload.description}
          </p>
        </div>

        {/* Provider Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t.upload.providerTitle}
            </CardTitle>
            <CardDescription>
              {t.upload.providerDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as StorageProvider)}
              disabled={isUploading}
            >
              <SelectTrigger className="w-full h-auto min-h-[52px]">
                <SelectValue placeholder="Select a provider">
                  {provider && (
                    <div className="flex items-center gap-3">
                      {providerOptions.find(p => p.value === provider)?.icon}
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{providerOptions.find(p => p.value === provider)?.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {providerOptions.find(p => p.value === provider)?.description}
                        </span>
                      </div>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="py-2.5 px-3">
                    <div className="flex items-center gap-3">
                      {option.icon}
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* File Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t.upload.uploadTitle}
            </CardTitle>
            <CardDescription>
              {t.upload.uploadDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              value={files}
              onValueChange={handleFilesChange}
              onFileValidate={onFileValidate}
              onFileReject={onFileReject}
              onUpload={onUpload}
              accept="image/*"
              maxFiles={MAX_FILES}
              maxSize={MAX_FILE_SIZE}
              className="w-full"
              disabled={isUploading}
            >
              <FileUploadDropzone className="min-h-[200px]">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center rounded-full border-2 border-dashed p-4">
                    <Upload className="size-8 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm">
                      {t.upload.dragDrop}
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {t.upload.orClick}
                    </p>
                  </div>
                  <FileUploadTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-2">
                      {t.upload.browseFiles}
                    </Button>
                  </FileUploadTrigger>
                </div>
              </FileUploadDropzone>

              <FileUploadList className="mt-4">
                {files.map((file) => {
                  const uploadedFile = uploadedFiles.find((uf) => uf.file === file);
                  return (
                    <FileUploadItem key={file.name} value={file} className="relative">
                      <FileUploadItemPreview className="size-12 rounded-md" />
                      <FileUploadItemMetadata />
                      <FileUploadItemProgress variant="linear" className="absolute bottom-0 left-0 right-0 h-1 rounded-b-md" />
                      {uploadedFile && (
                        <div className="flex items-center gap-1 text-primary">
                          <Check className="size-4" />
                          <span className="text-xs">{t.upload.uploaded}</span>
                        </div>
                      )}
                      <FileUploadItemDelete asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={isUploading}
                        >
                          <X className="size-4" />
                        </Button>
                      </FileUploadItemDelete>
                    </FileUploadItem>
                  );
                })}
              </FileUploadList>
            </FileUpload>

            {files.length > 0 && (
              <div className="flex justify-end mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={isUploading}
                >
                  {t.upload.clearAll}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uploaded Files Summary */}
        {uploadedFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Check className="size-5 text-primary" />
                {t.upload.uploadedTitle}
              </CardTitle>
              <CardDescription>
                {t.upload.uploadedDescription.replace('{count}', uploadedFiles.length.toString())}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uploadedFiles.map((uploadedFile, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <img
                      src={uploadedFile.url}
                      alt={uploadedFile.file.name}
                      className="size-12 rounded-md object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {uploadedFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Provider: {uploadedFile.provider.toUpperCase()}
                      </p>
                    </div>
                    <a
                      href={uploadedFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {t.upload.viewFile}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Status */}
        {isUploading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">{t.upload.uploading}</span>
          </div>
        )}
      </div>
    </div>
  );
}
