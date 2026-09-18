import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const metadata = {
  title: "QwenLab",
  description: "Standalone chat interface for experimenting with Qwen",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="h-full bg-neutral-950 text-neutral-100 antialiased overscroll-none">
        {children}
      </body>
    </html>
  );
}
