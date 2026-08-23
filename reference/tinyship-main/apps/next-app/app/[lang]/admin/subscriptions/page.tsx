import { headers } from 'next/headers'
import Link from 'next/link'
import { DataTable } from './data-table';
import { Button } from '@libs/react-shared/ui/button';
import { Plus } from 'lucide-react'
import { translations } from '@libs/i18n';
import { config } from '@config';

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SubscriptionsPage({ params, searchParams }: PageProps) {
  const [{ lang }, rawParams] = await Promise.all([
    params,
    searchParams
  ]);
  
  const t = translations[lang as keyof typeof translations];
  
  const page = Number(rawParams.page) || 1;
  const pageSize = 10;
  const searchField = (rawParams.searchField as string) || "id";
  const searchValue = (rawParams.searchValue as string) || "";
  const status = (rawParams.status as string) || "all";
  const paymentType = (rawParams.paymentType as string) || "all";
  const sortBy = (rawParams.sortBy as string) || undefined;
  const sortDirection = (rawParams.sortDirection as "asc" | "desc") || undefined;

  // 构建API查询参数
  const queryParams = new URLSearchParams({
    limit: pageSize.toString(),
    offset: ((page - 1) * pageSize).toString(),
  });

  // 添加搜索参数
  if (searchValue) {
    queryParams.append('searchField', searchField);
    queryParams.append('searchValue', searchValue);
  }

  // 添加筛选参数
  if (status && status !== 'all') {
    queryParams.append('status', status);
  }
  if (paymentType && paymentType !== 'all') {
    queryParams.append('paymentType', paymentType);
  }

  // 添加排序参数
  if (sortBy && sortDirection) {
    queryParams.append('sortBy', sortBy);
    queryParams.append('sortDirection', sortDirection);
  }

  try {
    // 调用API获取订阅数据
    const baseUrl = config.app.baseUrl;
    const apiUrl = `${baseUrl}/api/admin/subscriptions?${queryParams.toString()}`;
    console.log('Fetching subscriptions from:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: await headers(),
      cache: 'no-store', // 确保获取最新数据
    });

    if (!response.ok) {
      throw new Error('Failed to fetch subscriptions');
    }

    const data = await response.json();
    const totalPages = Math.ceil((data?.total || 0) / pageSize);

    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.subscriptions.title}</h1>
        </div>
        <div className="flex flex-col gap-4">
          <DataTable 
            data={data?.subscriptions || []} 
            pagination={{
              currentPage: page,
              totalPages,
              pageSize,
              total: data?.total || 0
            }}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.subscriptions.title}</h1>
        </div>
        <div className="flex flex-col gap-4">
          <div className="text-center py-10">
            <p className="text-red-500">{t.admin.subscriptions.messages.fetchError}</p>
          </div>
        </div>
      </div>
    );
  }
} 