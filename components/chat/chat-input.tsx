"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Upload, X, FileUp, Loader2 } from "lucide-react";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  onFileUpload: (file: File) => void;
  isLoading: boolean;
  uploadingFile: string | null;
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  onFileUpload,
  isLoading,
  uploadingFile,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = "";
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type === "application/pdf") {
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  return (
    <div
      className="border-t p-3 space-y-2"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 text-sm text-primary">
          <Upload className="h-4 w-4" />
          Drop PDF to upload
        </div>
      )}

      {uploadingFile && (
        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-3 py-2">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <FileUp className="h-3 w-3 shrink-0" />
          <span className="truncate">Uploading {uploadingFile}...</span>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploadingFile}
          className="shrink-0 mb-0.5"
          title="Upload PDF"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about compliance..."
          className="min-h-[2.5rem] max-h-32 resize-none text-sm"
          rows={1}
        />

        <Button
          size="icon-sm"
          onClick={onSubmit}
          disabled={!input.trim() || isLoading}
          className="shrink-0 mb-0.5"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
