import { Role, Subject, AppUser } from '@libs/permissions/types';

/**
 * 模拟普通用户数据
 */
export const mockNormalUser: AppUser = {
  id: 'user_normal_123',
  name: '普通用户',
  email: 'normal@example.com',
  emailVerified: true,
  image: null,
  role: Role.NORMAL,
  provider: 'credentials',
  providerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  phoneNumber: null,
  phoneNumberVerified: false
};

/**
 * 模拟VIP用户数据
 */
export const mockVipUser: AppUser = {
  id: 'user_vip_456',
  name: 'VIP用户',
  email: 'vip@example.com',
  emailVerified: true,
  image: null,
  role: Role.VIP,
  provider: 'credentials',
  providerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  phoneNumber: null,
  phoneNumberVerified: false
};

/**
 * 模拟管理员用户数据
 */
export const mockAdminUser: AppUser = {
  id: 'user_admin_789',
  name: '管理员用户',
  email: 'admin@example.com',
  emailVerified: true,
  image: null,
  role: Role.ADMIN,
  provider: 'credentials',
  providerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  phoneNumber: null,
  phoneNumberVerified: false
};

/**
 * 模拟项目数据
 */
export const mockProjects = {
  // 属于普通用户的项目
  normalUserProject: {
    id: 'proj_normal_123',
    name: '普通用户的项目',
    description: '这是普通用户创建的项目',
    ownerId: mockNormalUser.id,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // 属于VIP用户的项目
  vipUserProject: {
    id: 'proj_vip_456',
    name: 'VIP用户的项目',
    description: '这是VIP用户创建的项目',
    ownerId: mockVipUser.id,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // 公共项目
  publicProject: {
    id: 'proj_public_789',
    name: '公共项目',
    description: '这是所有人都可以查看的公共项目',
    ownerId: 'system',
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

/**
 * 模拟报告数据
 */
export const mockReports = {
  basicReport: {
    id: 'report_basic_123',
    name: '基础报告',
    projectId: mockProjects.normalUserProject.id,
    ownerId: mockNormalUser.id,
    createdAt: new Date()
  },
  
  advancedReport: {
    id: 'report_advanced_456',
    name: '高级分析报告',
    projectId: mockProjects.vipUserProject.id,
    ownerId: mockVipUser.id,
    createdAt: new Date()
  }
};

/**
 * 模拟订阅数据
 */
export const mockSubscriptions = {
  normalSubscription: {
    id: 'sub_normal_123',
    userId: mockNormalUser.id,
    planId: 'basic',
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date()
  },
  
  vipSubscription: {
    id: 'sub_vip_456',
    userId: mockVipUser.id,
    planId: 'premium',
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date()
  }
}; 