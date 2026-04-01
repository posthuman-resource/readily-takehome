"use client";

import { useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageCircle, X } from "lucide-react";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  const { messages, sendMessage, status } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage({ text });
  }, [input, isLoading, sendMessage]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploadingFile(file.name);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "regulatory");

        const response = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          sendMessage({
            text: `I tried to upload "${file.name}" but got an error: ${err.error || "Upload failed"}`,
          });
          return;
        }

        const { documentId } = await response.json();
        sendMessage({
          text: `I just uploaded a regulatory document "${file.name}". The document ID is ${documentId}. Please check its ingestion status and let me know when it's done processing.`,
        });
      } catch {
        sendMessage({
          text: `I tried to upload "${file.name}" but the upload failed. Can you help me troubleshoot?`,
        });
      } finally {
        setUploadingFile(null);
      }
    },
    [sendMessage]
  );

  return (
    <>
      {/* Floating chat button */}
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full shadow-lg"
        aria-label="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-md p-0 flex flex-col"
        >
          <SheetHeader className="border-b px-4 py-3 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle>Compliance Assistant</SheetTitle>
                <SheetDescription className="text-xs">
                  Ask questions, search policies, or upload documents
                </SheetDescription>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <ChatMessages messages={messages} isLoading={isLoading} />

          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onFileUpload={handleFileUpload}
            isLoading={isLoading}
            uploadingFile={uploadingFile}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
