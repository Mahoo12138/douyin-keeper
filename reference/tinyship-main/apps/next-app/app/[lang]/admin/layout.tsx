import { SidebarProvider, SidebarTrigger } from "@libs/react-shared/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { translations } from "@libs/i18n";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    title: t.admin.metadata.title,
    description: t.admin.metadata.description,
    keywords: t.admin.metadata.keywords,
};
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-grow">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  );
}
