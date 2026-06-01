import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { MapPin, Activity, ShieldAlert, Plus, X, Search, Sparkles, Camera, ArrowLeft, Send, Calendar, Spline, ArrowUpRight, TrendingUp, Flame, Bell, Mail, LayoutDashboard, Map, Plug } from 'lucide-react';
import { mockEvents, mockRoadAlerts } from './data';
import { AppEvent, RoadAlert } from './types';
import { GoogleGenAI } from '@google/genai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Map Recentrer specific component
const MapRecentrer = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 13, { duration: 1.5 });
  }, [center, map]);
  return null;
};

// Initialize Gemini Client as per the skill instructions
declare var process: any;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const integrations = [
  { id: "mapbox", name: "Mapas", icon: "🗺️" },
  { id: "gemini", name: "Gemini", icon: "✨" },
  { id: "datosgov", name: "INVIAS", icon: "🛣️" },
  { id: "airtable", name: "Airtable", icon: "📊" },
  { id: "firecrawl", name: "Firecrawl", icon: "🔥" },
  { id: "browseai", name: "Browse AI", icon: "🤖" },
  { id: "vercel", name: "Vercel", icon: "▲" },
  { id: "fontur", name: "FONTUR", icon: "🇨🇴" },
];

export default function App() {
  // Navigation State
  const [currentScreen, setCurrentScreen] = useState<'login' | 'home' | 'map' | 'ai' | 'events_list' | 'towns_list' | 'roads_list' | 'integrations_list'>('login');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showSearches, setShowSearches] = useState(false);
  const [mySearches, setMySearches] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentRoute, setCurrentRoute] = useState<[number, number][] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Map Data State
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [alerts, setAlerts] = useState<RoadAlert[]>(mockRoadAlerts);
  const [towns, setTowns] = useState<any[]>([]);
  
  // Loading States
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [isRoadsLoading, setIsRoadsLoading] = useState(true);
  const [isTownsLoading, setIsTownsLoading] = useState(true);

  const loadSearches = async () => {
    try {
      const res = await fetch("/api/searches");
      const data = await res.json();
      if (data.success) {
        setMySearches(data.data);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleSearch = async (kw: string) => {
    if (!kw) return;
    try {
      await fetch('/api/search', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ keyword: kw })
      });
      setCurrentScreen('map');
    } catch(e) {}
  };

  // Notion Data Loaders
  useEffect(() => {
    // Load Events
    setIsEventsLoading(true);
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
          // Map to AppEvent internally
          const notionEvents: AppEvent[] = data.data.map((evt: any) => ({
             id: evt.id,
             title: evt.evento,
             description: evt.resumen,
             date: evt.fecha || "Próximamente",
             created_time: evt.created_time,
             location: `${evt.municipio}, ${evt.departamento}`,
             category: evt.categoria || "Cultural",
             position: (evt.latitud && evt.longitud) ? [evt.latitud, evt.longitud] : [1.2136, -77.2811], // fallback if no coords
             image: evt.imagen || "https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800", // fallback image
             source: evt.fuente
          }));
          setEvents(notionEvents);
        } else {
           setEvents(mockEvents);
        }
      })
      .catch(() => setEvents(mockEvents))
      .finally(() => setIsEventsLoading(false));

    // Load Roads
    setIsRoadsLoading(true);
    fetch('/api/roads')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
           const notionRoads: RoadAlert[] = data.data.map((r: any) => ({
             id: r.id,
             title: r.title,
             description: r.description,
             status: r.status,
             position: r.position || [1.2, -77.2]
          }));
          setAlerts(notionRoads);
        }
      })
      .catch(console.error)
      .finally(() => setIsRoadsLoading(false));
      
    // Load Towns (Pueblos)
    setIsTownsLoading(true);
    fetch('/api/towns')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
           setTowns(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setIsTownsLoading(false));
  }, []);

  // Map UI State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showInvias, setShowInvias] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showTowns, setShowTowns] = useState(true);
  const [isAdding, setIsAdding] = useState<'event' | 'alert' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<[number, number] | null>(null);
  const [selectedItem, setSelectedItem] = useState<{type: 'event'|'town'|'road', data: any} | null>(null);
  const [formData, setFormData] = useState({ title: '', source: '', amount: 'low', desc: '' });
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Carousel Auto-scroll Logic
  useEffect(() => {
    if (currentScreen !== 'home' || events.length === 0) return;
    
    const count = Math.min(events.length, 6);
    if (count <= 1) return;

    const timer = setTimeout(() => {
      const carousel = document.getElementById('events-carousel');
      if (carousel && carousel.children.length > 0) {
        let nextIndex = carouselIndex + 1;
        if (nextIndex >= count) nextIndex = 0;
        
        const item = carousel.children[0] as HTMLElement;
        const itemWidth = item.offsetWidth + 16;
        carousel.scrollTo({ left: itemWidth * nextIndex, behavior: 'smooth' });
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [carouselIndex, events, currentScreen]);


  // AI Agent State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('');
  const [base64Data, setBase64Data] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Constants
  const centerPosition: [number, number] = [1.2136, -77.2811];
  const [mapCenter, setMapCenter] = useState<[number, number]>(centerPosition);

  const stats = {
    festivals: events.length,
    towns: towns.length,
    roadsMonitored: alerts.length,
    scrapedThisWeek: events.length > 0 ? 10 : 0, // Using 10 as mock for this week based on recent scraping
  };
  
  const scrapeTrend = useMemo(() => {
    // Generate an array of the last 30 days
    const now = new Date();
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days[dateStr] = 0;
    }
    
    // Count events grouped by their created_time day
    events.forEach(evt => {
        if (evt.created_time) {
            const dateStr = evt.created_time.split('T')[0];
            if (days[dateStr] !== undefined) {
                days[dateStr] += 1;
            }
        }
    });
    
    return Object.keys(days).map(date => ({
        date: date.substring(5), // MM-DD
        eventos: days[date]
    }));
  }, [events]);

  const cards = [
    { label: "Festividades activas", value: stats.festivals, icon: Calendar, accent: "text-primary-foreground", bg: "bg-sun", ring: "shadow-glow hover:-translate-y-1", action: 'events_list' },
    { label: "Vías monitoreadas", value: stats.roadsMonitored, icon: Spline, accent: "text-secondary-foreground", bg: "bg-jungle", ring: "shadow-card hover:-translate-y-1", action: 'roads_list' },
  ];

  const handleLogin = async (provider: string) => {
    setIsLoggingIn(true);
    
    // Simulate OAuth/User details
    const mockUser: any = {
      name: "Julián Ruiz",
      email: "juliian.ruiizz99@gmail.com",
      provider: provider,
      photoUrl: provider === 'Google' ? "https://lh3.googleusercontent.com/a/default-user" : "https://i.pravatar.cc/150?u=outlook"
    };

    // Ask for Notifications permission upon login to notify about new events
    if ("Notification" in window) {
       Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
             console.log("Notificaciones habilitadas para la app.");
          }
       });
    }

    try {
      await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockUser),
      });
      // Delay for UX
      setTimeout(() => {
        setCurrentUser(mockUser);
        setIsLoggingIn(false);
        setCurrentScreen('home');
      }, 1000);
    } catch (err) {
      console.error("Failed to register:", err);
      setIsLoggingIn(false);
      setCurrentScreen('home');
    }
  };

  const handleDirections = (destination: [number, number] | string | null | undefined) => {
    if (!destination) return;
    
    let destLat: number, destLng: number;
    if (Array.isArray(destination)) {
      destLat = destination[0];
      destLng = destination[1];
    } else {
      const parts = destination.split(',');
      if (parts.length === 2) {
         destLat = parseFloat(parts[0]);
         destLng = parseFloat(parts[1]);
      } else {
         return;
      }
    }
    
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
       const lat = position.coords.latitude;
       const lng = position.coords.longitude;
       setUserLocation([lat, lng]);
       
       try {
          const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`);
          const data = await resp.json();
          if (data.routes && data.routes.length > 0) {
             const coords = data.routes[0].geometry.coordinates; // OSRM returns coordinates as [lng, lat]
             if(coords) {
                const leafletCoords = coords.map((c: number[]) => [c[1], c[0]]);
                setCurrentRoute(leafletCoords);
                setMapCenter([lat, lng]);
                setCurrentScreen('map');
             }
          } else {
             alert('No se pudo encontrar una ruta.');
          }
       } catch (err) {
          console.error("Error fetching route", err);
          alert('Error al calcular la ruta.');
       }
    }, () => {
       alert("No pudimos obtener tu ubicación, verifica los permisos.");
    });
  };

  // Map Event Handler
  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (isAdding) {
          setPendingLocation([e.latlng.lat, e.latlng.lng]);
        }
      },
    });
    return null;
  };

  const handleMapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLocation) {
      alert("Por favor, haz clic en el mapa para definir la ubicación.");
      return;
    }
    
    setIsSubmitting(true);
    let requestData;

    try {
      if (isAdding === 'event') {
        const newEvent: AppEvent = {
          id: `e-${Date.now()}`,
          title: formData.title,
          date: new Date().toISOString(),
          position: pendingLocation,
          source: formData.source || 'Usuario',
          crowdLevel: formData.amount as 'low' | 'medium' | 'high'
        };
        requestData = { type: 'event', data: newEvent };
      } else if (isAdding === 'alert') {
        const newAlert: RoadAlert = {
          id: `r-${Date.now()}`,
          title: formData.title,
          description: formData.desc,
          position: pendingLocation,
          status: formData.amount === 'high' ? 'closed' : 'restricted'
        };
        requestData = { type: 'alert', data: newAlert };
      }

      const res = await fetch("/api/submit-user-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData)
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        alert(result.error || "Ocurrió un error en la verificación.");
        setIsSubmitting(false);
        return;
      }

      if (isAdding === 'event') {
        setEvents([...events, requestData.data]);
      } else if (isAdding === 'alert') {
        setAlerts([...alerts, requestData.data]);
      }
      
      if ("Notification" in window && Notification.permission === "granted") {
         new Notification("NomadAp Notificación", {
            body: `Se ha registrado tu nuevo ${isAdding === 'event' ? 'evento' : 'reporte'} en NomadAp.`,
            icon: currentUser?.photoUrl
         });
      }

      setIsAdding(null);
      setPendingLocation(null);
      setFormData({ title: '', source: '', amount: 'low', desc: '' });
      alert("Reporte válido verificado por la IA y guardado en Notion ✅");
    } catch (err) {
      alert("Error de conexión al enviar el reporte.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCrowdColor = (level: AppEvent['crowdLevel']) => {
    switch (level) {
      case 'high': return '#ef4444';
      case 'medium': return '#fbbf24';
      case 'low': return '#10b981';
      default: return '#3b82f6';
    }
  };

  const getAlertColor = (status: RoadAlert['status']) => {
    return status === 'closed' ? '#ef4444' : '#f59e0b';
  };

  // AI Logic
  const handleAIUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultString = reader.result as string;
        setImagePreview(resultString);
        setMimeType(file.type);
        setBase64Data(resultString.split(',')[1]);
      };
      reader.readAsDataURL(file);
    }
  };

  const executeAnalysis = async () => {
    setAiLoading(true);
    setAiResult('');
    try {
      const parts: any[] = [{ text: prompt || "¿Qué lugar, festividad o ruta es esta y qué me puedes decir al respecto en muy pocas palabras?" }];
      if (base64Data) {
        parts.push({
          inlineData: { mimeType, data: base64Data }
        });
      }
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts }
      });
      setAiResult(response.text || 'Sin información detectada.');
    } catch (err: any) {
      setAiResult(`Error de IA Ocurrido: ${err.message || 'Desconocido'}`);
    } finally {
      setAiLoading(false);
      setPrompt('');
    }
  };


  const getSourceBadgeColor = (source: string | undefined) => {
    if (!source) return 'bg-accent/20 text-accent-foreground border-accent/40';
    if (source.includes('udenar')) return 'bg-secondary/20 text-secondary-foreground border-secondary/40';
    if (source.includes('pasto')) return 'bg-primary/20 text-primary border-primary/40';
    if (source.includes('narino')) return 'bg-coral/20 text-coral border-coral/40';
    return 'bg-accent/20 text-accent-foreground border-accent/40';
  }

  return (
    <div className="bg-black/90 min-h-screen w-full flex items-center justify-center p-0 md:p-4 font-sans">
      <div className="bg-background text-foreground h-[100dvh] md:h-[800px] w-full max-w-[480px] overflow-hidden relative flex flex-col mx-auto md:rounded-[2rem] shadow-2xl md:border-8 md:border-[#1a1c1a]">
      
      {/* -------------------- BACKGROUND MAP -------------------- */}
      {/* Always mounted to avoid Leaflet rendering bugs, just hidden via z-index when needed */}
      <div className="absolute inset-0 z-0 bg-background">
        <MapContainer
          center={mapCenter}
          zoom={12}
          className="w-full h-full"
          zoomControl={false}
        >
          <MapRecentrer center={mapCenter} />
          <TileLayer
            attribution='&copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapClickHandler />

          {currentRoute && (
            <Polyline positions={currentRoute} pathOptions={{ color: '#FAAD14', weight: 5, opacity: 0.8 }} />
          )}
          {userLocation && (
             <Circle center={userLocation} radius={100} pathOptions={{ fillColor: '#4338ca', color: '#4338ca', fillOpacity: 0.5 }} />
          )}

          {isAdding && pendingLocation && (
            <Marker position={pendingLocation} opacity={0.8}>
              <Popup className="custom-popup shadow-lg">Ubicación nueva</Popup>
            </Marker>
          )}

          {showEvents && events.map(event => (
            <Marker key={event.id} position={event.position}>
              <Popup className="custom-popup rounded-xl shadow-lg m-0 p-0 overflow-hidden min-w-[200px]">
                <div className="flex flex-col">
                  {event.image && (
                    <img src={event.image || 'https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800'} alt={event.title} className="w-full h-24 object-cover m-0 rounded-t-xl" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://picsum.photos/seed/' + event.title.replace(/\s/g, '') + '/800/400'; }} />
                  )}
                  <div className="p-3">
                    <div className="text-[10px] font-bold text-accent mb-1 tracking-widest uppercase">Cat. {event.category}</div>
                    <h3 className="font-bold text-foreground leading-tight mb-1">{event.title}</h3>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mb-1">
                      <MapPin className="w-3 h-3 text-coral" />
                      {event.location}
                    </div>
                    {event.description && <p className="text-[11px] text-foreground/80 line-clamp-3 mb-2">{event.description}</p>}
                    <div className="text-[10px] text-muted-foreground mb-3 truncate">Vía: {event.source?.replace('https://', '').split('/')[0] || 'Desconocido'}</div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleDirections(event.position)}
                        className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <MapPin className="w-3 h-3" />
                        Llegar
                      </button>
                      <button 
                        onClick={() => setSelectedItem({ type: 'event', data: event })}
                        className="flex-1 py-2 bg-secondary text-secondary-foreground rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-secondary/90 transition-colors flex items-center justify-center gap-1.5"
                      >
                        Más Info
                      </button>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {showHeatmap && events.map(event => (
            <Circle
              key={`heat-${event.id}`}
              center={event.position}
              pathOptions={{ color: getCrowdColor(event.crowdLevel), fillColor: getCrowdColor(event.crowdLevel), fillOpacity: 0.4, weight: 0 }}
              radius={event.crowdLevel === 'high' ? 800 : event.crowdLevel === 'medium' ? 500 : 300}
            />
          ))}

          {showInvias && alerts.map(alert => (
            <Circle
              key={alert.id}
              center={alert.position}
              pathOptions={{ color: getAlertColor(alert.status), fillColor: getAlertColor(alert.status), fillOpacity: 0.6, weight: 2, dashArray: '4 4' }}
              radius={300}
            >
              <Popup>
                <div className="p-1 min-w-[150px]">
                  <div className="text-[10px] font-bold text-destructive mb-1 flex items-center gap-1 uppercase tracking-wider">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Alerta INVIAS
                  </div>
                  <h3 className="font-bold text-foreground mb-1">{alert.title}</h3>
                  <p className="text-[11px] text-muted-foreground font-medium mb-3">{alert.description}</p>
                  
                  <button 
                    onClick={() => handleDirections(alert.position)}
                    className="w-full py-2 bg-destructive text-destructive-foreground rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-md hover:bg-destructive/90 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <MapPin className="w-3 h-3" />
                    Cómo llegar
                  </button>
                </div>
              </Popup>
            </Circle>
          ))}

        </MapContainer>
      </div>

      {/* -------------------- MAP UI OVERLAY -------------------- */}
      {currentScreen === 'map' && (
        <>
          {/* TOP HEADER */}
          <header className="absolute top-0 w-full z-[80] p-4 pt-6 flex justify-between items-center pointer-events-none bg-gradient-to-b from-background to-transparent pb-10">
            <div className="flex items-center gap-3 pointer-events-auto">
              <button onClick={() => setCurrentScreen('home')} className="w-10 h-10 bg-card backdrop-blur-md shadow-card border border-border rounded-[14px] flex items-center justify-center text-foreground active:scale-90 transition-transform">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-display tracking-wider text-foreground drop-shadow-[0_4px_12px_hsl(var(--deep)/0.8)] pt-1">
                Nomadap<span className="text-primary text-sm ml-1 font-sans font-medium lowercase">map</span>
              </h1>
            </div>
            <div className="bg-card/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-auto shadow-card">
              <span className="w-2 h-2 animate-pulse bg-secondary rounded-full"></span>
              <span className="text-[11px] font-bold tracking-wide text-foreground">ON</span>
            </div>
          </header>

          {/* FLOATING LAYER TOGGLES */}
          <div className="absolute top-20 w-full z-[80] px-4 pointer-events-none pt-2">
            <div className="flex gap-2.5 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto">
              <button onClick={() => setShowEvents(!showEvents)} className={`px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-card flex items-center gap-2 transition-all outline-none whitespace-nowrap shrink-0 ${showEvents ? 'bg-sun text-primary-foreground border-transparent shadow-glow' : 'bg-card text-muted-foreground border border-border backdrop-blur-md'}`}>
                <MapPin className="w-3.5 h-3.5" /> Eventos
              </button>
              <button onClick={() => setShowHeatmap(!showHeatmap)} className={`px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-card flex items-center gap-2 transition-all outline-none whitespace-nowrap shrink-0 ${showHeatmap ? 'bg-tropic text-accent-foreground border-transparent shadow-coral' : 'bg-card text-muted-foreground border border-border backdrop-blur-md'}`}>
                <Activity className="w-3.5 h-3.5" /> Afluencia
              </button>
              <button onClick={() => setShowInvias(!showInvias)} className={`px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-card flex items-center gap-2 transition-all outline-none whitespace-nowrap shrink-0 ${showInvias ? 'bg-jungle text-secondary-foreground border-transparent shadow-card' : 'bg-card text-muted-foreground border border-border backdrop-blur-md'}`}>
                <ShieldAlert className="w-3.5 h-3.5" /> INVIAS
              </button>
            </div>
          </div>

          {/* FLOATING ACTION BUTTONS */}
          <div className="absolute right-5 bottom-[60px] z-[80] flex flex-col gap-4 pointer-events-auto">
            <button className="bg-card border-2 border-border text-accent shadow-card w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90" onClick={() => setIsAdding('alert')}>
              <ShieldAlert className="w-5 h-5 pointer-events-none" />
            </button>
            <button className="bg-sun text-primary-foreground shadow-glow w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90 border-2 border-transparent" onClick={() => setIsAdding('event')}>
              <Plus className="w-7 h-7 pointer-events-none" />
            </button>
          </div>

          {/* FORM MODAL - MOBILE SHEET */}
          {isAdding && (
            <div className="absolute inset-0 z-[3000] bg-background/80 backdrop-blur-sm flex items-end justify-center pointer-events-auto">
              <div className="w-full bg-card border-t border-border rounded-t-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300 shadow-card h-[85dvh]">
                <div className="flex justify-center pt-4 pb-2 shrink-0">
                  <div className="w-12 h-1.5 bg-border rounded-full"></div>
                </div>
                <div className="px-6 pb-4 flex items-center justify-between border-b border-border shrink-0">
                  <h3 className="font-display text-3xl text-foreground tracking-wider">
                    {isAdding === 'event' ? 'Nuevo Evento' : 'Alerta Vial'}
                  </h3>
                  <button onClick={() => { setIsAdding(null); setPendingLocation(null); }} className="p-2 bg-background hover:bg-border rounded-full text-muted-foreground transition-colors">
                    <X className="w-5 h-5 pointer-events-none" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  <form onSubmit={handleMapSubmit} className="p-6 space-y-6">
                    {!pendingLocation && (
                      <div className="p-4 bg-primary/10 text-primary rounded-xl text-sm border border-primary/20 flex items-start gap-3">
                        <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="font-medium">Toca cualquier punto del mapa para fijar las <strong className="font-bold">Coordenadas</strong>.</p>
                      </div>
                    )}
                    {pendingLocation && (
                      <div className="p-4 bg-secondary/10 text-secondary rounded-xl text-sm border border-secondary/20 flex items-center gap-3">
                        <MapPin className="w-5 h-5 shrink-0" />
                        <p className="font-medium">Ubicación capturada correctamente.</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Título / Nombre</label>
                      <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-input border border-border text-foreground rounded-xl p-4 text-[15px] focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder-muted-foreground/50" placeholder="Ej. Fiesta Guaneña" />
                    </div>

                    {isAdding === 'event' && (
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Fuente</label>
                        <input type="text" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} className="w-full bg-input border border-border text-foreground rounded-xl p-4 text-[15px] focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder-muted-foreground/50" placeholder="Ej. Archivo PDF, URL..." />
                      </div>
                    )}

                    {isAdding === 'alert' && (
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Descripción Técnica</label>
                        <textarea value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} className="w-full bg-input border border-border text-foreground rounded-xl p-4 text-[15px] h-28 resize-none focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder-muted-foreground/50" placeholder="Detalles de la vía afectada..." />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                        {isAdding === 'event' ? 'Nivel de Afluencia' : 'Gravedad del Cierre'}
                      </label>
                      <select value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full bg-input border border-border text-foreground rounded-xl p-4 text-[15px] focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none font-medium">
                        {isAdding === 'event' ? (
                          <>
                            <option value="low" className="bg-background">🟢 Baja (Pocas aglomeraciones)</option>
                            <option value="medium" className="bg-background">🟡 Media (Concurrido)</option>
                            <option value="high" className="bg-background">🔴 Alta (Máxima afluencia)</option>
                          </>
                        ) : (
                          <>
                            <option value="low" className="bg-background">🟡 Paso Restringido a un carril</option>
                            <option value="high" className="bg-background">🔴 Cierre Total Inmediato</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="pt-2 pb-6">
                      <button type="submit" disabled={!pendingLocation || isSubmitting} className="w-full py-4 bg-sun text-primary-foreground rounded-xl font-bold tracking-widest uppercase text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground disabled:border-border border border-transparent shadow-glow disabled:shadow-none active:scale-[0.98]">
                        {isSubmitting ? 'Verificando con IA...' : (pendingLocation ? 'Guardar en Mapa' : 'Selecciona un punto en el mapa')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}



      {/* -------------------- MY SEARCHES -------------------- */}
      {showSearches && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
           <div className="bg-card w-full max-w-sm rounded-2xl shadow-card border border-border p-6 flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between mb-6">
                 <h2 className="font-display text-2xl text-foreground tracking-wider">Mis Búsquedas</h2>
                 <button onClick={() => setShowSearches(false)} className="p-2 hover:bg-border rounded-full transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4">
                 {mySearches.length === 0 ? (
                   <p className="text-muted-foreground text-center py-8 text-sm">No hay búsquedas recientes.</p>
                 ) : (
                   mySearches.map((s: any) => (
                      <div key={s.id} className="p-4 bg-background rounded-xl border border-border/50 shadow-sm flex flex-col gap-2 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setShowSearches(false); handleSearch(s.keyword); }}>
                         <div className="flex items-center gap-3 text-foreground font-medium">
                            <Search className="w-4 h-4 text-muted-foreground" />
                            {s.keyword}
                         </div>
                         <div className="text-[10px] text-muted-foreground uppercase tracking-wider pl-7">
                            Hace {Math.max(1, Math.floor((new Date().getTime() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24)))} días
                         </div>
                      </div>
                   ))
                 )}
              </div>
           </div>
        </div>
      )}

      {/* -------------------- SIDEBAR MENU -------------------- */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-[300] flex animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-[280px] bg-[#081813] h-[100dvh] flex flex-col pt-8 pb-6 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-300">
            
            {/* Sidebar Header */}
            <div className="flex items-center gap-3 px-6 mb-10">
              <div className="w-10 h-10 bg-[#FAAD14] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(250,173,20,0.4)] overflow-hidden cursor-pointer animate-pulse">
                 <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div className="pt-1 flex items-baseline gap-2">
                <h2 className="font-display text-2xl tracking-wider text-white leading-none">NOMADAP</h2>
                <p style={{ fontFamily: "'Playfair Display', serif" }} className="text-gold italic text-xl leading-none mt-1 drop-shadow-[0_0_8px_rgba(250,173,20,0.6)]">Auténtica</p>
              </div>
            </div>

            <div className="flex-1 px-3 space-y-8">
              {/* Explorar Section */}
              <div>
                <p className="text-[10px] text-white/40 tracking-[0.15em] uppercase font-bold mb-3 px-3">Explorar</p>
                <div className="space-y-1">
                  <button onClick={() => { setCurrentScreen('home'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${currentScreen === 'home' ? 'bg-[#2a301a] text-[#FAAD14]' : 'text-white/80 hover:bg-white/5'}`}>
                    <LayoutDashboard className="w-5 h-5" />
                    <span className="font-medium">Inicio</span>
                  </button>
                  <button onClick={() => { setCurrentScreen('map'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${currentScreen === 'map' ? 'bg-[#2a301a] text-[#FAAD14]' : 'text-white/80 hover:bg-white/5'}`}>
                    <Map className="w-5 h-5" />
                    <span className="font-medium">Mapa</span>
                  </button>
                  <button onClick={() => { setCurrentScreen('events_list'); setIsSidebarOpen(false); }} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-white/80 hover:bg-white/5">
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">Festividades</span>
                  </button>
                  <button onClick={() => { setCurrentScreen('ai'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${currentScreen === 'ai' ? 'bg-[#2a301a] text-[#FAAD14]' : 'text-white/80 hover:bg-white/5'}`}>
                    <Sparkles className="w-5 h-5" />
                    <span className="font-medium">Asistente IA</span>
                  </button>
                </div>
              </div>

              {/* Operación Section */}
              <div>
                <p className="text-[10px] text-white/40 tracking-[0.15em] uppercase font-bold mb-3 px-3">Operación</p>
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-white/80 hover:bg-white/5">
                    <Spline className="w-5 h-5" />
                    <span className="font-medium">Vías INVIAS</span>
                  </button>
                  <button onClick={() => { setCurrentScreen('integrations_list'); setIsSidebarOpen(false); }} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-white/80 hover:bg-white/5">
                    <Plug className="w-5 h-5" />
                    <span className="font-medium">Integraciones</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Offline Mode */}
            <div className="px-4 mt-8">
              <div className="bg-[#0a2019] border border-white/5 rounded-xl p-4">
                <p className="text-sm font-bold text-white mb-1">Modo Offline</p>
                <p className="text-xs text-white/50 font-medium">Caché lista para zonas rurales</p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* -------------------- LOGIN SCREEN -------------------- */}
      {currentScreen === 'login' && (
        <div className="absolute inset-0 z-[200] bg-cafe flex flex-col justify-center p-4">
          <div className="absolute inset-0 pattern-cafe opacity-60 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-40 pattern-andes pointer-events-none" />
          <div className="bg-card/90 backdrop-blur-xl border border-border rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-card relative z-10 text-center mx-auto">
              <div className="w-12 h-12 bg-sun rounded-xl flex items-center justify-center font-display text-primary-foreground text-3xl shadow-glow mx-auto mb-4 overflow-hidden animate-pulse">
                 <img src="/logo.png" alt="Nomadap Logo" className="w-full h-full object-cover" />
              </div>
              <h1 className="font-display text-4xl tracking-wider text-foreground mb-2 leading-none">Únete a<br/>NOMADAP</h1>
              <p className="text-muted-foreground text-[13px] font-medium mb-8 text-balance">Explora y descubre la Colombia auténtica con mapas inteligentes e IA.</p>
              
              <div className="space-y-3">
                  <button disabled={isLoggingIn} onClick={() => handleLogin('Google')} className="w-full bg-white text-slate-900 font-bold rounded-xl p-3.5 flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-md hover:bg-slate-50 border border-slate-200 disabled:opacity-70 disabled:cursor-wait">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                     </svg>
                     {isLoggingIn ? "Conectando..." : "Continuar con Google"}
                  </button>
                  <button disabled={isLoggingIn} onClick={() => handleLogin('Outlook')} className="w-full bg-[#0078D4] text-white font-bold rounded-xl p-3.5 flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-md hover:bg-[#006abc] disabled:opacity-70 disabled:cursor-wait">
                     <svg className="w-5 h-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                     </svg>
                     {isLoggingIn ? "Conectando..." : "Continuar con Outlook"}
                  </button>
              </div>
              
              <div className="mt-8 pt-6 border-t border-border/50 text-[11px] text-muted-foreground/80 leading-relaxed max-w-xs mx-auto">
                <p>Al registrarte, aceptas nuestros <a href="#" className="text-primary hover:underline">términos de servicio</a> y permites el uso de tu nombre y foto de perfil.</p>
              </div>
          </div>
        </div>
      )}

      {/* -------------------- HOME SCREEN OVERLAY (LOVABLE THEME) -------------------- */}
      {currentScreen === 'home' && (
        <div className="absolute inset-0 z-[100] bg-background w-full overflow-y-auto hidden-scrollbar">
          <div className="p-4 space-y-6 max-w-[480px] mx-auto pb-24 bg-background min-h-screen">
            
            {/* Header & Search */}
            <header className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsSidebarOpen(true)} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all overflow-hidden bg-sun shadow-glow animate-pulse">
                       <img src="/logo.png" alt="Nomadap Logo" className="w-full h-full object-cover" />
                    </button>
                    <h1 className="font-display text-3xl tracking-wider text-foreground pt-1">NOMADAP</h1>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => alert("Próximamente: Las notificaciones de estado de vías y eventos cercanos estarán disponibles en la próxima actualización.")} className="relative bg-card border border-border p-2 rounded-full cursor-pointer shadow-card text-foreground transition-colors hover:text-primary">
                     <Bell className="w-5 h-5" />
                     <span className="absolute top-1 right-1.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-card"></span>
                  </button>
                  <div className="relative">
                    <div className="bg-card border border-border p-1 rounded-full cursor-pointer shadow-card hover:border-primary/50 transition-colors" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                        <img src={currentUser?.photoUrl || "https://ui-avatars.com/api/?name=User&background=random"} alt="User" className="w-9 h-9 rounded-full object-cover" />
                    </div>
                    {isProfileOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-glow overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                         <div className="p-3 border-b border-border/50">
                            <p className="text-sm font-bold text-foreground truncate">{currentUser?.name || "Mi Cuenta Google"}</p>
                         </div>
                         <button onClick={() => { setIsProfileOpen(false); loadSearches(); setShowSearches(true); }} className="w-full text-left px-4 py-3 text-sm hover:bg-border transition-colors font-medium text-foreground">Mis búsquedas</button>
                         <button onClick={() => { setCurrentUser(null); setIsProfileOpen(false); setCurrentScreen('login'); }} className="w-full text-left px-4 py-3 text-sm hover:bg-destructive/10 hover:text-destructive transition-colors font-medium text-destructive">Cerrar sesión</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="relative z-10">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Search className="w-5 h-5 text-muted-foreground/80" />
                </div>
                <input 
                   type="text" 
                   className="w-full bg-card/60 backdrop-blur border border-border text-foreground rounded-2xl py-4 pl-12 pr-4 text-[15px] focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-card transition-all font-medium placeholder-muted-foreground/70" 
                   placeholder="Buscar festividades, pueblos y vías..." 
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') handleSearch(e.currentTarget.value);
                   }}
                />
              </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-cafe p-6 md:p-10 shadow-card">
              <div className="absolute inset-0 pattern-cafe opacity-60" />
              <div className="absolute inset-x-0 bottom-0 h-40 pattern-andes" />
              <div className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-sun opacity-40 blur-3xl animate-pulse-soft" aria-hidden />
              <div className="absolute top-8 right-8 h-20 w-20 rounded-full bg-gold opacity-90 shadow-glow animate-pulse-soft" aria-hidden />
              
              <div className="relative max-w-2xl space-y-4">
                <h1 className="leading-tight text-balance drop-shadow-[0_4px_24px_hsl(var(--deep)/0.8)] pt-4 relative">
                  <span className="absolute -left-4 top-2 h-16 w-1 bg-wine rounded-full hidden md:block"></span>
                  <span className="font-sans font-normal text-3xl md:text-5xl block pb-1">Descubre una</span>
                  <span className="font-sans font-bold text-5xl md:text-7xl block pb-1">Colombia</span>
                  <span style={{ fontFamily: "'Playfair Display', serif" }} className="text-gold italic font-medium text-5xl md:text-7xl block transition-all hover:scale-105 drop-shadow-[0_0_12px_rgba(250,173,20,0.7)]">Auténtica</span>
                  <span className="absolute -right-2 bottom-4 h-3 w-3 bg-wine rounded-full animate-pulse-soft hidden md:block"></span>
                </h1>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button onClick={() => setCurrentScreen('map')} className="inline-flex items-center gap-2 rounded-xl bg-sun px-5 py-3 md:px-6 md:py-4 font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition active:scale-95">
                    Abrir mapa <ArrowUpRight className="h-4 w-4" />
                  </button>
                  <button onClick={() => setCurrentScreen('ai')} className="inline-flex items-center gap-2 rounded-xl border border-coral/60 bg-coral/15 backdrop-blur px-5 py-3 md:px-6 md:py-4 font-semibold text-foreground hover:bg-coral/25 transition active:scale-95 shadow-coral">
                    <Sparkles className="h-5 w-5 text-coral" /> Hablar con la IA
                  </button>
                </div>
              </div>
            </section>

            {/* Stats Row */}
            <section className="grid grid-cols-2 gap-3">
              <div onClick={() => setCurrentScreen('events_list')} className={`relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 shadow-glow hover:-translate-y-1 cursor-pointer`}>
                <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full bg-sun opacity-60 blur-2xl`} />
                <div className={`relative inline-flex p-2 flex items-center justify-center rounded-lg bg-sun text-primary-foreground mb-3 shadow-card`}>
                  <Calendar className="h-4 w-4" />
                </div>
                <p className="relative font-display text-4xl tracking-wider text-foreground leading-none">
                  {isEventsLoading ? <span className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></span> : stats.festivals}
                </p>
                <p className="relative text-xs text-muted-foreground mt-1.5 font-medium">Festividades activas</p>
              </div>

              <div onClick={() => setCurrentScreen('roads_list')} className={`relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 shadow-card hover:-translate-y-1 cursor-pointer`}>
                <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full bg-jungle opacity-60 blur-2xl`} />
                <div className={`relative inline-flex p-2 flex items-center justify-center rounded-lg bg-jungle text-secondary-foreground mb-3 shadow-card`}>
                  <Spline className="h-4 w-4" />
                </div>
                <p className="relative font-display text-4xl tracking-wider text-foreground leading-none">
                  {isRoadsLoading ? <span className="inline-block w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span> : stats.roadsMonitored}
                </p>
                <p className="relative text-xs text-muted-foreground mt-1.5 font-medium">Vías monitoreadas</p>
              </div>
            </section>
            
            {/* Festivities (Bento layout) */}
            <section className="col-span-1 gap-6 pb-20">
              
              {/* Festivities */}
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="font-display text-3xl tracking-wider text-foreground">Próximas fiestas</h2>
                  </div>
                </div>
                <div className="relative">
                  <div 
                    id="events-carousel"
                    className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 [&::-webkit-scrollbar]:hidden scroll-smooth"
                    onScroll={(e) => {
                      const scrollLeft = e.currentTarget.scrollLeft;
                      const itemWidth = (e.currentTarget.children[0] as HTMLElement).offsetWidth + 16; // width + gap
                      setCarouselIndex(Math.round(scrollLeft / itemWidth));
                    }}
                  >
                    {events.slice(0, 6).map((f) => (
                      <article key={f.id} className="w-60 max-w-[75vw] sm:w-72 sm:max-w-none snap-center shrink-0 group relative overflow-hidden rounded-xl p-[2px] bg-fiesta transition-all shadow-card hover:shadow-glow cursor-pointer" onClick={() => {
                          setSelectedItem({ type: 'event', data: f });
                          if (f.position) setMapCenter(f.position as [number, number]);
                          setCurrentScreen('map');
                      }}>
                      <div className="rounded-[10px] bg-card overflow-hidden h-full flex flex-col">
                        <div className="relative aspect-[4/3] sm:aspect-video overflow-hidden shrink-0">
                          <img src={f.image || 'https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800'} alt={f.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://picsum.photos/seed/' + encodeURIComponent(f.title) + '/800/400'; }} />
                          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-fiesta" />
                          <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[80%]">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getSourceBadgeColor(f.source)} truncate break-all max-w-full block`}>
                              {f.source?.replace('https://', '').split('/')[0] || 'Desconocido'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-deep/80 backdrop-blur border border-border text-foreground text-[10px] font-bold">
                               Cat. {f.category}
                            </span>
                          </div>
                          
                          <div className="absolute top-3 right-3 text-center bg-card/90 backdrop-blur border border-border rounded shadow-card p-1">
                            <span className="block text-sm font-display text-foreground leading-none">
                              {f.date ? new Date(f.date).toLocaleDateString() : '?'}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <h3 className="font-display text-2xl tracking-wider text-foreground leading-none mb-2 line-clamp-2">{f.title}</h3>
                          <div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium mb-3">
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-coral" /> {f.location}</span>
                            </div>
                            <p className="text-sm text-foreground/80 line-clamp-3">
                              {f.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                  </div>
                  {/* Dots Indicator */}
                  <div className="flex justify-center gap-2 mt-2">
                    {events.slice(0, 6).map((_, i) => (
                      <button 
                        key={i} 
                        onClick={() => {
                          const carousel = document.getElementById('events-carousel');
                          if (carousel) {
                            const item = carousel.children[0] as HTMLElement;
                            const itemWidth = item.offsetWidth + 16;
                            carousel.scrollTo({ left: itemWidth * i, behavior: 'smooth' });
                          }
                        }}
                        className={`h-2 rounded-full cursor-pointer transition-all ${i === carouselIndex ? 'w-6 bg-sun' : 'w-2 bg-border hover:bg-sun/50'}`} 
                        aria-label={`Ir al evento ${i + 1}`}
                      />
                    ))}
                  </div>
                  <p style={{fontFamily: "'Playfair Display', serif"}} className="text-center italic mt-10 text-xl text-foreground font-medium w-full block tracking-wide">
                     Vive, Explora y Siente cada lugar.<br/>
                     Colombia te espera.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}


      {/* -------------------- AI SCREEN OVERLAY -------------------- */}
      {currentScreen === 'ai' && (
        <div className="absolute inset-0 z-[100] bg-background flex flex-col w-full">
         <div className="max-w-[480px] mx-auto w-full flex flex-col h-full bg-card shadow-2xl relative">
          
          <div className="flex items-center gap-4 p-5 pt-8 border-b border-border shrink-0 bg-card/90 backdrop-blur-md z-10 relative">
            <button onClick={()=>setCurrentScreen('home')} className="p-2.5 bg-background border border-border rounded-lg text-foreground active:scale-95 transition-transform shadow-card">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="pt-1">
              <h2 className="font-display text-2xl tracking-wider text-foreground leading-none">Agente Nomadap</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <Sparkles className="w-3 h-3 text-coral" />
                <p className="text-[10px] text-coral font-bold uppercase tracking-widest">Powered by Gemini</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 relative z-0">
             <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-tropic opacity-20 blur-3xl -z-10 pointer-events-none" />
             
            <div className="bg-background/80 backdrop-blur border border-border rounded-xl p-5 mb-2 relative overflow-hidden shadow-card">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-20 h-20 text-coral" /></div>
                <h3 className="font-display text-2xl tracking-wider text-foreground mb-1 relative z-10">¿Dudas en la ruta?</h3>
                <p className="text-sm text-muted-foreground font-medium relative z-10 leading-relaxed text-balance">Usa este agente multimodal para reconocer peajes, interpretar fotos de paisajes o identificar destinos turísticos desconocidos.</p>
            </div>

            <div className="relative">
                {!imagePreview ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col items-center justify-center w-full h-[180px] border border-border rounded-xl cursor-pointer bg-card hover:bg-card/80 transition-colors group shadow-card">
                      <div className="w-14 h-14 bg-background text-foreground group-hover:text-primary group-hover:border-primary/30 border border-transparent rounded-full flex items-center justify-center mb-4 shadow-card transition-all">
                        <Camera className="w-6 h-6" />
                      </div>
                      <p className="text-[14px] text-foreground font-semibold">Tomar foto</p>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleAIUpload} />
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-[180px] border border-border rounded-xl cursor-pointer bg-card hover:bg-card/80 transition-colors group shadow-card">
                      <div className="w-14 h-14 bg-background text-foreground group-hover:text-primary group-hover:border-primary/30 border border-transparent rounded-full flex items-center justify-center mb-4 shadow-card transition-all">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <p className="text-[14px] text-foreground font-semibold">Adjuntar foto</p>
                      <input type="file" className="hidden" accept="image/*" onChange={handleAIUpload} />
                    </label>
                  </div>
                ) : (
                  <div className="relative w-full h-[240px] rounded-xl overflow-hidden border border-border shadow-card group">
                    <div className="absolute inset-0 bg-card animate-pulse -z-10"></div>
                    <img src={imagePreview} className="w-full h-full object-cover" alt="Preview"/>
                    <button onClick={() => {setImagePreview(null); setBase64Data(''); }} className="absolute top-4 right-4 bg-background/90 border border-border backdrop-blur p-2.5 rounded-full text-foreground shadow-card active:scale-95 transition-transform"><X className="w-5 h-5 pointer-events-none" /></button>
                  </div>
                )}
            </div>

            {aiResult && (
              <div className="bg-coral/10 border border-coral/20 rounded-xl p-5 text-sm text-foreground leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-2 duration-500 shadow-coral mb-6">
                <div className="flex items-center gap-2 mb-3 border-b border-coral/20 pb-3">
                  <Sparkles className="w-4 h-4 text-coral" />
                  <span className="text-coral font-bold uppercase tracking-widest text-[11px]">Respuesta Gemini 3.1</span>
                </div>
                {aiResult}
              </div>
            )}
            <div className="h-6"></div>
          </div>

          <div className="p-4 bg-card border-t border-border pb-8 shrink-0 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 bg-input rounded-xl p-2 pr-2 border border-border shadow-card focus-within:border-primary/50 transition-all">
                <input type="text" value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !aiLoading) executeAnalysis()}} placeholder="Ej. ¿A quién pertenece este peaje?" className="flex-1 bg-transparent text-[15px] font-medium text-foreground px-3 outline-none placeholder-muted-foreground" />
                <button onClick={executeAnalysis} disabled={aiLoading || (!base64Data && !prompt)} className="bg-sun text-primary-foreground w-12 h-12 rounded-lg flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all active:scale-95 shadow-glow shrink-0">
                  {aiLoading ? <Activity className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 -ml-0.5 mt-0.5" />}
                </button>
            </div>
          </div>
         </div>
        </div>
      )}

      {/* -------------------- LIST SCREENS -------------------- */}
      {currentScreen === 'events_list' && (
        <div className="absolute inset-0 z-[100] bg-background flex flex-col w-full overflow-y-auto pb-20">
          <div className="max-w-[480px] mx-auto w-full bg-background min-h-screen">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10 border-b border-border">
            <h2 className="font-display text-2xl tracking-wider text-foreground">Festividades Activas</h2>
            <button onClick={() => setCurrentScreen('home')} className="p-2 border border-border rounded-lg text-foreground hover:bg-card">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 hidden">List implementation goes here</div>
          
          <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
             {events.map((f) => (
                <article key={f.id} className="group relative overflow-hidden rounded-xl p-[2px] bg-fiesta shadow-card cursor-pointer" onClick={() => setSelectedItem({ type: 'event', data: f })}>
                  <div className="rounded-[10px] bg-card overflow-hidden h-full flex flex-col">
                    <div className="relative aspect-[16/10] overflow-hidden shrink-0">
                      <img src={f.image || 'https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800'} alt={f.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://picsum.photos/seed/' + encodeURIComponent(f.title) + '/800/400'; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                      <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getSourceBadgeColor(f.source)} block`}>
                          {f.source?.replace('https://', '').split('/')[0] || 'Desconocido'}
                        </span>
                      </div>
                      <div className="absolute top-3 right-3 text-center bg-card/90 backdrop-blur border border-border rounded shadow-card p-1">
                        <span className="block text-sm font-display text-foreground leading-none">
                          {f.date ? new Date(f.date).toLocaleDateString() : '?'}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-2 flex-1 flex flex-col">
                      <h3 className="font-display text-xl tracking-wider text-foreground leading-tight mb-2 line-clamp-2">{f.title}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium mb-3">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-coral" /> {f.location}</span>
                      </div>
                    </div>
                  </div>
                </article>
             ))}
          </div>
         </div>
        </div>
      )}

      {currentScreen === 'towns_list' && (
        <div className="absolute inset-0 z-[100] bg-background flex flex-col w-full overflow-y-auto pb-20">
          <div className="max-w-[480px] mx-auto w-full bg-background min-h-screen">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10 border-b border-border">
            <h2 className="font-display text-2xl tracking-wider text-foreground">Pueblos Cubiertos</h2>
            <button onClick={() => setCurrentScreen('home')} className="p-2 border border-border rounded-lg text-foreground hover:bg-card">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
             {towns.map((t) => (
                <article key={t.id} className="group relative overflow-hidden rounded-xl border border-secondary bg-card shadow-coral cursor-pointer transition-all hover:-translate-y-1" onClick={() => setSelectedItem({ type: 'town', data: t })}>
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img src={t.image || 'https://images.unsplash.com/photo-1547473078-cbffce75e1ec?w=800'} alt={t.name} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://picsum.photos/seed/' + encodeURIComponent(t.name) + '/800/400'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-deep/80 backdrop-blur border border-border text-foreground text-[10px] font-bold">
                        {t.department}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-xl tracking-wider text-foreground mb-1">{t.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  </div>
                </article>
             ))}
          </div>
         </div>
        </div>
      )}

      {currentScreen === 'roads_list' && (
        <div className="absolute inset-0 z-[100] bg-background flex flex-col w-full overflow-y-auto pb-20">
          <div className="max-w-[480px] mx-auto w-full bg-background min-h-screen">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10 border-b border-border">
            <h2 className="font-display text-2xl tracking-wider text-foreground">Vías Monitoreadas</h2>
            <button onClick={() => setCurrentScreen('home')} className="p-2 border border-border rounded-lg text-foreground hover:bg-card">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-4 space-y-4">
             {alerts.map((a) => (
                <div key={a.id} className="flex gap-4 p-4 rounded-xl border border-border bg-card shadow-card cursor-pointer items-start hover:border-primary/50 transition-all" onClick={() => setSelectedItem({ type: 'road', data: a })}>
                  <div className={`p-2 rounded-lg shrink-0 ${a.status === 'restricted' ? 'bg-coral/20 text-coral' : a.status === 'warning' ? 'bg-sun/20 text-sun' : 'bg-primary/20 text-primary'}`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1 leading-tight">{a.title}</h3>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                    <div className="text-[10px] font-bold uppercase mt-2 opacity-70">
                      {new Date(a.date).toLocaleString()}
                    </div>
                  </div>
                </div>
             ))}
               {alerts.length === 0 && <p className="text-muted-foreground text-center py-10">No hay reportes de vías en este momento.</p>}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- DETAIL OVERLAY -------------------- */}
      {selectedItem && (
        <div className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-card w-full max-w-lg border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {selectedItem.data.image && selectedItem.type !== 'road' && (
              <img src={selectedItem.data.image} alt="Cover" className="w-full h-48 sm:h-64 object-cover shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://picsum.photos/800/400?random=1'; }} />
            )}
            <div className="p-6 overflow-y-auto">
              <div className="flex justify-between items-start mb-4 gap-4">
                <h2 className="font-display text-3xl tracking-wider text-foreground leading-tight">
                  {selectedItem.data.title || selectedItem.data.name}
                </h2>
                <button onClick={() => setSelectedItem(null)} className="p-2 border border-border rounded-lg bg-background text-foreground shrink-0 mt-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedItem.type === 'event' && (
                <div className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded border border-border bg-input font-bold text-xs">Cat. {selectedItem.data.category}</span>
                    <span className="px-2 py-1 rounded border border-border bg-input font-bold text-xs">{selectedItem.data.date}</span>
                    <span className="px-2 py-1 rounded border border-border bg-input font-bold text-xs text-coral flex items-center gap-1"><MapPin className="w-3 h-3"/> {selectedItem.data.location}</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{selectedItem.data.description || selectedItem.data.summary}</p>
                  <a href={selectedItem.data.source} target="_blank" rel="noreferrer" className="block text-sm text-primary hover:underline font-medium">Ver fuente original</a>
                  
                  <div className="pt-4 border-t border-border/50">
                    <button 
                      onClick={() => handleDirections(selectedItem.data.position || selectedItem.data.location_coords)}
                      className="w-full py-4 rounded-xl bg-waze text-waze-foreground font-bold tracking-wider uppercase text-sm shadow-card flex items-center justify-center gap-2 transition-all active:scale-95 hover:-translate-y-1"
                    >
                      <MapPin className="w-5 h-5" /> INICIAR RUTA
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.type === 'town' && (
                <div className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded border border-border bg-input font-bold text-xs">{selectedItem.data.department}</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{selectedItem.data.description}</p>
                  
                  <div className="pt-4 border-t border-border/50">
                    <button 
                      onClick={() => {
                        const c = selectedItem.data.location.split(',').map((x: string) => parseFloat(x));
                        handleDirections([c[0], c[1]]);
                      }}
                      className="w-full py-4 rounded-xl bg-waze text-waze-foreground font-bold tracking-wider uppercase text-sm shadow-card flex items-center justify-center gap-2 transition-all active:scale-95 hover:-translate-y-1"
                    >
                      <MapPin className="w-5 h-5" /> PLANEAR RUTA
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.type === 'road' && (
                <div className="space-y-4">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs uppercase tracking-wider
                    ${selectedItem.data.status === 'restricted' ? 'bg-coral/20 text-coral border-coral/30' : 
                      selectedItem.data.status === 'warning' ? 'bg-sun/20 text-sun border-sun/30' : 
                      'bg-primary/20 text-primary border-primary/30'}
                  `}>
                    <ShieldAlert className="w-4 h-4" /> {selectedItem.data.status}
                  </div>
                  <p className="text-secondary-foreground leading-relaxed text-lg font-medium">{selectedItem.data.description}</p>
                  <p className="text-sm text-muted-foreground">Reportado: {new Date(selectedItem.data.date).toLocaleString()}</p>
                  
                  {selectedItem.data.position && (
                    <div className="pt-4 border-t border-border/50">
                      <button 
                        onClick={() => handleDirections(selectedItem.data.position)}
                        className="w-full py-3 rounded-xl bg-card border border-border font-bold text-foreground uppercase tracking-wider shadow-card flex items-center justify-center gap-2 transition-all hover:bg-input"
                      >
                         VER RUTA
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {currentScreen === 'integrations_list' && (
        <div className="absolute inset-0 z-[100] bg-background flex flex-col w-full overflow-y-auto pb-20">
          <div className="max-w-[480px] mx-auto w-full bg-background min-h-screen">
            <div className="p-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10 border-b border-border">
              <h2 className="font-display text-2xl tracking-wider text-foreground">Integraciones</h2>
              <button onClick={() => setCurrentScreen('home')} className="p-2 border border-border rounded-lg text-foreground hover:bg-card">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-2">
              {integrations.map((integ) => (
                <div key={integ.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 shadow-card hover:border-primary/50 transition-all cursor-pointer">
                   <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-2xl shadow-inner border border-border/50">
                      {integ.icon}
                   </div>
                   <div>
                      <h3 className="font-display text-lg tracking-wide text-foreground">{integ.name}</h3>
                      <p className="text-xs text-muted-foreground font-medium text-balance mt-0.5">Integración nativa activa y conectada.</p>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
