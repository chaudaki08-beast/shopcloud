import { UserRole } from './enums';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
}
