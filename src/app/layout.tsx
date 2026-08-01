import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vocalyze AI — Communication Diagnostics",
  description:
    "A personal mirror for communication practice. Improve your speaking confidence with AI-driven feedback on speech quality, delivery, and presence.",
  keywords: ["communication", "public speaking", "AI feedback", "presentation skills"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f4f2ef]">{children}</body>
    </html>
  );
}
