export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  timestamp: string;
};

