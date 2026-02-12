// Bookmark 領域模型

export interface Bookmark {
  id: string;
  userId: string;
  postId: string;
  createdAt: Date;
}

export interface BookmarkWithPost extends Bookmark {
  post: {
    id: string;
    title: string | null;
    content: string;
    sentiment: number;
    postedAt: Date;
    kol: {
      id: string;
      name: string;
      avatarUrl: string | null;
    };
    stocks: {
      id: string;
      ticker: string;
      name: string;
    }[];
  };
}
