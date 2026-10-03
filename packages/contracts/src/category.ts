export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  parentId?: string | null;
}

export interface UpdateCategoryDto extends Partial<CreateCategoryDto> {}
