import { headers } from 'next/headers'
import Link from 'next/link'
import { DataTable } from './data-table';
import { Button } from '@libs/react-shared/ui/button';
import { UserPlus } from 'lucide-react'
import { translations } from '@libs/i18n';
import { config } from '@config';

type SearchField = "email" | "name" | "id";
type Role = "admin" | "user" | "all";
type BannedStatus = "true" | "false" | "all";

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function UserPage({ params, searchParams }: PageProps) {
  // Await both params and searchParams
  const [{ lang }, rawParams] = await Promise.all([
    params,
    searchParams
  ]);
  
  const t = translations[lang as keyof typeof translations];
  
  // Safely get values from searchParams
  const page = Number(rawParams.page) || 1;
  const pageSize = 10;
  const searchField = (rawParams.searchField as SearchField) || "email";
  const searchValue = (rawParams.searchValue as string) || "";
  const role = (rawParams.role as Role) || "all";
  const banned = (rawParams.banned as BannedStatus) || "all";
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
  if (role && role !== 'all') {
    queryParams.append('role', role);
  }
  if (banned && banned !== 'all') {
    queryParams.append('banned', banned);
  }

  // 添加排序参数
  if (sortBy && sortDirection) {
    queryParams.append('sortBy', sortBy);
    queryParams.append('sortDirection', sortDirection);
  }

  try {
    // 调用API获取用户数据
    const baseUrl = config.app.baseUrl;
    const apiUrl = `${baseUrl}/api/admin/users?${queryParams.toString()}`;
    console.log('Fetching users from:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: await headers(),
      cache: 'no-store', // 确保获取最新数据
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    const totalPages = Math.ceil((data?.total || 0) / pageSize);

    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.users.title}</h1>
          
          <Link href='/admin/users/new'><Button>
            <UserPlus className="mr-2 h-4 w-4"></UserPlus>
            {t.admin.users.actions.addUser}
          </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <DataTable 
            data={data?.users || []} 
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
    console.error('Error fetching users:', error);
    return (
      <div className="container mx-auto py-10 px-5">
        <div className='flex items-center justify-between mb-4'>
          <h1 className="text-2xl font-bold">{t.admin.users.title}</h1>
          
          <Link href='/admin/users/new'><Button>
            <UserPlus className="mr-2 h-4 w-4"></UserPlus>
            {t.admin.users.actions.addUser}
          </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <div className="text-center py-10">
            <p className="text-red-500">{t.admin.users.messages.fetchError}</p>
          </div>
        </div>
      </div>
    );
  }
}