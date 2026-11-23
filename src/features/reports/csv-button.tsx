"use client";

import { buttonClass } from "@/shared/ui/button";

/** lejar.ai's "Download CSV" button (a client-side file of the statement as shown). */
export function CsvButton({ csv, fileName }: { csv: string; fileName: string }) {
  return (
    <button
      type="button"
      className={buttonClass("primary", "default")}
      onClick={() => {
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Download CSV
    </button>
  );
}
