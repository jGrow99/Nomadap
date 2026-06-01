export interface AppEvent {
  id: string;
  title: string;
  date: string;
  created_time?: string;
  position: [number, number];
  source: string;
  crowdLevel?: 'low' | 'medium' | 'high';
  description?: string;
  location?: string;
  category?: string;
  image?: string;
}

export interface RoadAlert {
  id: string;
  title: string;
  description: string;
  position: [number, number];
  status: 'closed' | 'restricted';
}
