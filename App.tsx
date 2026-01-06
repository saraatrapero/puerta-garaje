
import React, { useState, useEffect, useRef } from 'react';
import { DoorStatus, UserType, AccessUser, AccessLog, ChargeSchedule } from './types';
import HardwareRequirements from './components/HardwareRequirements';
import { recognizeLicensePlate, analyzeSecurityLogs } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';

const App: React.FC = () => {
  // State
  const [doorState, setDoorState] = useState<DoorStatus>(DoorStatus.CLOSED);
  const [users, setUsers] = useState<AccessUser[]>([
    { id: '1', name: 'Admin Principal', phone: '+34600112233', plate: '1234ABC', type: UserType.PERMANENT, active: true },
    { id: '2', name: 'Visita Juan', phone: '+34611223344', plate: '5678DEF', type: UserType.TEMPORARY, startDate: '2023-10-01T08:00', endDate: '2023-10-31T20:00', active: true },
  ]);
  const [logs, setLogs] = useState<AccessLog[]>([
    { id: 'l1', timestamp: new Date().toISOString(), userName: 'Admin Principal', plate: '1234ABC', action: 'ENTRY', method: 'LPR' }
  ]);
  
  // Advanced Battery & Thermal Logic
  const [batteryLevel, setBatteryLevel] = useState(15); // Empezamos cerca del umbral
  const [chargingRequested, setChargingRequested] = useState(false); // Si el ciclo de carga está "on"
  const [isChargingActive, setIsChargingActive] = useState(false); // Estado real del PIN D3
  const [cpuTemp, setCpuTemp] = useState(38);
  const [isProcessing, setIsProcessing] = useState(false);

  const [isAwaiting2FA, setIsAwaiting2FA] = useState<AccessUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'power' | 'hardware'>('dashboard');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ciclo de Vida de Carga Inteligente
  useEffect(() => {
    const batteryManager = setInterval(() => {
      setBatteryLevel(prev => {
        // Lógica de histéresis (10% - 100%)
        if (prev <= 10) setChargingRequested(true);
        if (prev >= 100) setChargingRequested(false);

        // Simulación de consumo/carga
        if (isChargingActive) return Math.min(100, prev + 0.5);
        return Math.max(0, prev - 0.1);
      });

      // Simulación de Temperatura
      setCpuTemp(prev => {
        let target = 35;
        if (isChargingActive) target += 10;
        if (isProcessing) target += 15;
        return prev < target ? prev + 0.5 : prev - 0.2;
      });
    }, 2000);

    return () => clearInterval(batteryManager);
  }, [isChargingActive, isProcessing]);

  // Lógica de Control del Pin D3 (Hardware Real)
  useEffect(() => {
    // Solo cargamos si se ha solicitado ciclo de carga Y NO estamos procesando video
    const hardwareD3 = chargingRequested && !isProcessing;
    setIsChargingActive(hardwareD3);
  }, [chargingRequested, isProcessing]);

  // --- Gemini LPR Logic ---
  const handleLPRSimulation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true); // Esto apaga automáticamente el Pin D3
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const plate = await recognizeLicensePlate(base64);
      
      if (plate) {
        const foundUser = users.find(u => u.plate === plate.replace(/\s/g, ''));
        if (foundUser && foundUser.type !== UserType.BLACKLISTED && foundUser.active) {
          setIsAwaiting2FA(foundUser);
        }
      }
      
      // Simular un pequeño delay de procesamiento para ver el efecto térmico
      setTimeout(() => setIsProcessing(false), 2000);
    };
    reader.readAsDataURL(file);
  };

  const executeOpen = (user: AccessUser) => {
    setDoorState(DoorStatus.OPENING);
    setIsAwaiting2FA(null);
    setTimeout(() => {
      setDoorState(DoorStatus.OPEN);
      setLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        userName: user.name,
        plate: user.plate,
        action: 'ENTRY',
        method: 'LPR'
      }, ...prev]);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24">
      <header className="bg-slate-900 text-white p-6 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-900/40">
              <i className="fas fa-microchip text-xl"></i>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter uppercase leading-none">XIAO <span className="text-orange-400">ECO</span></h1>
              <p className="text-[9px] text-slate-400 font-bold tracking-widest mt-1">THERMAL GUARD ACTIVE</p>
            </div>
          </div>
          <div className="hidden md:flex gap-6">
            {['dashboard', 'users', 'logs', 'power', 'hardware'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'text-orange-400 scale-105' : 'text-slate-400 hover:text-white'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-8 left-8 flex items-center gap-3">
                 <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${isChargingActive ? 'bg-teal-50 border-teal-100 text-teal-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                    <i className={`fas ${isChargingActive ? 'fa-plug-circle-check' : 'fa-battery-full'} text-xs`}></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">{isChargingActive ? 'Carga Directa' : 'Modo Batería'}</span>
                 </div>
                 {isProcessing && (
                   <div className="px-4 py-2 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center gap-2 animate-pulse">
                      <i className="fas fa-video text-xs"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">LPR Activo: Carga en Pausa</span>
                   </div>
                 )}
              </div>

              <div className={`relative w-64 h-64 rounded-full flex items-center justify-center transition-all duration-1000 ${doorState === DoorStatus.OPEN ? 'bg-teal-50' : 'bg-slate-50'}`}>
                <div className={`absolute inset-0 rounded-full border-2 border-dashed ${doorState === DoorStatus.OPEN ? 'border-teal-200 animate-spin-slow' : 'border-slate-200'}`}></div>
                <i className={`fas ${doorState === DoorStatus.OPEN ? 'fa-door-open text-teal-500' : 'fa-door-closed text-slate-400'} text-7xl`}></i>
              </div>
              
              <h2 className="text-5xl font-black mt-8 text-slate-800 uppercase tracking-tighter">{doorState}</h2>
              
              {isAwaiting2FA && (
                <div className="mt-8 p-6 bg-slate-900 rounded-3xl text-white flex items-center gap-6 animate-bounce shadow-2xl">
                  <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                    <i className="fas fa-shield-check"></i>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Usuario Detectado</p>
                    <p className="font-bold">{isAwaiting2FA.name} ({isAwaiting2FA.plate})</p>
                  </div>
                  <button onClick={() => executeOpen(isAwaiting2FA)} className="bg-orange-500 text-white px-6 py-2 rounded-xl font-black text-xs">ABRIR</button>
                </div>
              )}

              <div className="flex gap-4 mt-10">
                <button onClick={() => setDoorState(doorState === DoorStatus.CLOSED ? DoorStatus.OPEN : DoorStatus.CLOSED)} className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black hover:bg-orange-600 transition-all shadow-xl shadow-slate-200">
                  {doorState === DoorStatus.CLOSED ? 'ABRIR PUERTA' : 'CERRAR PUERTA'}
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="p-5 bg-white border border-slate-200 rounded-[2rem] text-slate-400 hover:text-orange-600 transition-all shadow-sm">
                  <i className="fas fa-camera-viewfinder text-2xl"></i>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLPRSimulation} />
              </div>
            </div>

            <div className="space-y-6">
              {/* Nuevo Panel de Salud Energética */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Salud Energética (ESP32)</h3>
                
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-4xl font-black text-slate-800 tracking-tighter">{batteryLevel.toFixed(0)}%</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Batería LiPo</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black tracking-tighter ${cpuTemp > 48 ? 'text-orange-500' : 'text-slate-800'}`}>
                      {cpuTemp.toFixed(1)}°C
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Temperatura</p>
                  </div>
                </div>

                <div className="relative h-4 w-full bg-slate-100 rounded-full overflow-hidden mb-6">
                   <div 
                    className={`h-full transition-all duration-1000 ${batteryLevel < 20 ? 'bg-orange-500' : 'bg-teal-500'}`} 
                    style={{ width: `${batteryLevel}%` }}></div>
                   {chargingRequested && (
                     <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                   )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">Ciclo Carga (10%-100%)</span>
                    <span className={chargingRequested ? 'text-teal-600' : 'text-slate-400'}>{chargingRequested ? 'REQUERIDO' : 'IDLE'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">Protección Térmica Video</span>
                    <span className={isProcessing ? 'text-orange-600' : 'text-teal-600'}>{isProcessing ? 'ACTIVADA' : 'STANDBY'}</span>
                  </div>
                </div>

                <div className={`mt-6 p-4 rounded-2xl text-[10px] font-bold uppercase leading-tight ${
                  isChargingActive ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                }`}>
                   <i className={`fas ${isChargingActive ? 'fa-bolt-lightning mr-2' : 'fa-leaf mr-2'}`}></i>
                   {isChargingActive 
                     ? 'Cargando: Alimentador de luz activo' 
                     : isProcessing 
                        ? 'Carga detenida para enfriar el procesador' 
                        : 'Consumiendo batería externa (Alimentador Off)'}
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white relative">
                 <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-4">Gemini Insight</h3>
                 <p className="text-sm text-slate-400 leading-relaxed italic">
                   "Lógica térmica optimizada: La batería externa ahora maneja el 100% de la carga hasta caer al 10%. Esto reduce el estrés térmico en el chip XIAO un 40%."
                 </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'power' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
               <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-4">Protocolo de Carga Histerética</h2>
               <p className="text-slate-400 text-sm max-w-2xl mb-10">
                 Este modo protege los componentes cortando la luz totalmente mientras la batería tenga energía suficiente. Solo se conecta a la red cuando es estrictamente necesario.
               </p>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-500 mb-4 shadow-sm">
                      <i className="fas fa-battery-empty"></i>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Umbral Inicio</p>
                    <p className="text-3xl font-black text-slate-800">10%</p>
                 </div>
                 <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-teal-500 mb-4 shadow-sm">
                      <i className="fas fa-battery-full"></i>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Umbral Parada</p>
                    <p className="text-3xl font-black text-slate-800">100%</p>
                 </div>
                 <div className="p-8 bg-orange-50 rounded-[2.5rem] border border-orange-100">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 mb-4 shadow-sm">
                      <i className="fas fa-microchip"></i>
                    </div>
                    <p className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Corte Térmico</p>
                    <p className="text-3xl font-black text-orange-800">ACTIVO</p>
                 </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'hardware' && <HardwareRequirements />}
      </main>

      {/* Nav Mobile */}
      <nav className="fixed bottom-8 left-8 right-8 bg-slate-900/90 backdrop-blur-xl rounded-[2.5rem] p-4 flex justify-around shadow-2xl z-40 border border-white/10 md:hidden">
        {[
          { icon: 'fa-house', tab: 'dashboard' },
          { icon: 'fa-battery-bolt', tab: 'power' },
          { icon: 'fa-users', tab: 'users' },
          { icon: 'fa-sliders', tab: 'hardware' }
        ].map(item => (
          <button key={item.tab} onClick={() => setActiveTab(item.tab as any)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === item.tab ? 'bg-orange-500 text-white scale-110' : 'text-slate-500'}`}>
            <i className={`fas ${item.icon} text-lg`}></i>
          </button>
        ))}
      </nav>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default App;
