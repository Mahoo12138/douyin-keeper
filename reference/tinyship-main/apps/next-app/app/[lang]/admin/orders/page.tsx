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

export default async function OrdersPage({ params, searchParams }: PageProps) {
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
  const provider = (rawParams.provider as string) || "all";
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
  if (provider && provider !== 'all') {
    queryParams.append('provider', provider);
  }

  // 添加排序参数
  if (sortBy && sortDirection) {
    queryParams.append('sortBy', sortBy);
    queryParams.append('sortDirection', sortDirection);
  }

  try {
    // 调用API获取订单数据
    const baseUrl = config.app.baseUrl;
    const apiUrl = `${baseUrl}/api/admin/orders?${queryParams.toString()}`;
    console.log('Fetching orders from:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: await headers(),
      cache: 'no-store', // 确保获取最新数据
    });

    if (!response.ok) {
      throw new Error('Failed to fetch orders');
    }

    const data = await response.json();
    const totalPages = Math.ceil((data?.total || 0) / pageSize);

    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.orders.title}</h1>
        </div>
        <div className="flex flex-col gap-4">
          <DataTable 
            data={data?.orders || []} 
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
    console.error('Error fetching orders:', error);
    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.orders.title}</h1>
          
          <Button>
            <Plus className="mr-2 h-4 w-4"></Plus>
            {t.admin.orders.actions.createOrder}
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="text-center py-10">
            <p className="text-red-500">{t.admin.orders.messages.fetchError}</p>
          </div>
        </div>
      </div>
    );
  }
} 