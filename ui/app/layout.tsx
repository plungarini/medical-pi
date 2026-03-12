import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { HydrationSuppressor } from "@/components/HydrationSuppressor";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Medical AI",
  description: "AI-powered medical assistant",
};

// Script to suppress hydration warnings from browser extensions (runs before React)
const suppressHydrationScript = `
  (function() {
    const isDarkReaderError = function(args) {
      const msg = Array.from(args).join(' ').toLowerCase();
      return msg.includes('hydration') && (
        msg.includes('data-darkreader') ||
        msg.includes('--darkreader') ||
        msg.includes('darkreader-inline')
      );
    };
    
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = function() {
      if (isDarkReaderError(arguments)) return;
      return originalError.apply(console, arguments);
    };
    
    console.warn = function() {
      if (isDarkReaderError(arguments)) return;
      return originalWarn.apply(console, arguments);
    };
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: suppressHydrationScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <HydrationSuppressor />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
