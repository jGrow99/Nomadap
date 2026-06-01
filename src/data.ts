import { AppEvent, RoadAlert } from './types.ts';

export const mockEvents: AppEvent[] = [
  {
    id: 'e1',
    title: 'Carnaval de Negros y Blancos',
    date: '2026-01-05T10:00:00Z',
    position: [1.2136, -77.2811], // Pasto
    source: 'PDF Turismo Pasto',
    crowdLevel: 'high',
  },
  {
    id: 'e2',
    title: 'Feria del Libro',
    date: '2026-05-15T09:00:00Z',
    position: [1.2200, -77.2850],
    source: 'Sitio Web Alcaldía',
    crowdLevel: 'medium',
  },
  {
    id: 'e3',
    title: 'Concierto Sinfónico',
    date: '2026-06-20T20:00:00Z',
    position: [1.2100, -77.2750],
    source: 'Noticias Culturales',
    crowdLevel: 'low',
  }
];

export const mockRoadAlerts: RoadAlert[] = [
  {
    id: 'r1',
    title: 'Cierre Vía Pasto-Mojarras',
    description: 'KM 45+200, cierre por remoción de masa.',
    position: [1.3500, -77.2500],
    status: 'closed',
  },
  {
    id: 'r2',
    title: 'Paso Restringido a un carril',
    description: 'Vía Pasto - Ipiales KM 12.',
    position: [1.0500, -77.3500],
    status: 'restricted',
  }
];
