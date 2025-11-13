export interface User {
  id: string;
  email: string;
  username: string;
  profile_data: Record<string, any>;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface UserProfile {
  username: string;
  profile_data?: Record<string, any>;
}