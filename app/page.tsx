"use client";

import { useState, useRef } from "react";

interface SellerRow {
  [key: string]: string;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  seller: string;
  status: "preparing" | "done" | "error";
}

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<SellerRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [context, setContext] = useState("");
  const [emails, setEmails] = useState<GeneratedEmail[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function parseCSV(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const h = lines[0].split(",").map((v) => v.replace(/"/g, "").trim());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
        const obj: SellerRow = {};
        h.forEach((col, i) => (obj[col] = vals[i] || ""));
        return obj;
      });
      setHeaders(h);
      setCsvData(rows);
      setFileName(file.name);
      setEmails([]);
    };
    reader.readAsText(file);
  }

  async function generateEmail(row: SellerRow, ctx: string, idx: number) {
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, context: ctx }),
      });
      const data = await res.json();
      setEmails((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], subject: data.subject, body: data.body, status: "done" };
        return updated;
      });
    } catch {
      setEmails((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: "error" };
        return updated;
      });
    }
  }

  async function startGeneration() {
    if (!csvData.length) return;
    setPreparing(true);
    const sellerKey = headers.find((h) => /name/i.test(h)) || headers[0];
    const initial: GeneratedEmail[] = csvData.map((row) => ({
      subject: "",
      body: "",
      seller: row[sellerKey] || "Seller",
      status: "preparing",
    }));
    setEmails(initial);
    await Promise.all(csvData.map((row, i) => generateEmail(row, context, i)));
    setPreparing(false);
  }

  function copyEmail(idx: number) {
    const e = emails[idx];
    if (!e) return;
    navigator.clipboard.writeText(`Subject: ${e.subject}\n\n${e.body}`);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Dispute Email Agent</h1>
          <p className="text-sm text-gray-500 mt-1">Upload a seller CSV and prepare the V1 document request email.</p>
        </div>

        {/* Step 1 */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Step 1 — Upload seller CSV</p>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseCSV(f); }}
          >
            {fileName ? (
              <>
                <div className="text-green-500 text-3xl mb-2">✓</div>
                <p className="font-medium text-gray-800">{fileName}</p>
                <p className="text-xs text-gray-400 mt-1">{csvData.length} seller rows · {headers.length} columns — click to replace</p>
              </>
            ) : (
              <>
                <div className="text-gray-300 text-3xl mb-2">↑</div>
                <p className="font-medium text-gray-700">Drop CSV here or click to upload</p>
                <p className="text-xs text-gray-400 mt-1">Any column names — V1 uses one static email draft</p>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) parseCSV(e.target.files[0]); }} />
          {headers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {headers.map((h) => (
                <span key={h} className="text-xs bg-gray-100 text-gray-500 rounded-full px-3 py-1">{h}</span>
              ))}
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Step 2 — Additional context (saved for future versions)</p>
          <textarea
            className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-800 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            rows={3}
            placeholder="V1 does not use this field to generate email text."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        {/* Generate */}
        <button
          onClick={startGeneration}
          disabled={!csvData.length || preparing}
          className="w-full bg-gray-900 text-white font-medium py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors mb-8"
        >
          {preparing ? "Preparing..." : emails.length ? "↺ Prepare again" : "Prepare emails"}
        </button>

        {/* Results */}
        {emails.length === 0 && (
          <div className="text-center text-gray-300 py-12">
            <div className="text-4xl mb-3">✉</div>
            <p className="text-sm">Emails will appear here after preparation</p>
          </div>
        )}
        {emails.map((email, idx) => (
          <div key={idx} className="bg-white border border-gray-100 rounded-xl p-5 mb-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-medium text-gray-900">{email.seller}</p>
                <p className="text-xs text-gray-400 mt-0.5">{email.subject || "Preparing subject..."}</p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${email.status === "done" ? "bg-green-50 text-green-600" : email.status === "error" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"}`}>
                {email.status === "done" ? "✓ Ready" : email.status === "error" ? "Error" : "Preparing..."}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {email.body || "..."}
            </div>
            {email.status === "done" && (
              <button onClick={() => copyEmail(idx)} className="mt-3 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                {copied === idx ? "✓ Copied" : "Copy email"}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
