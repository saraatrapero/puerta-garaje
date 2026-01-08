
import React, { useState, useEffect, useRef } from 'react';
import { DoorStatus, UserType, AccessUser, AccessLog } from './types';
import HardwareRequirements from './components/HardwareRequirements';
import { recognizeLicensePlate } from './services/geminiService';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

// Audio Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const App: React.FC = () => {
  const [doorState, setDoorState] = useState<DoorStatus>(DoorStatus.CLOSED);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'logs' | 'power' | 'hardware'>('dashboard');
  
  // Kit 400 Specific State
  const [autoCloseTime, setAutoCloseTime] = useState<0 | 20 | 40 | 60>(0);
  const [isIrBlocked, setIsIrBlocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Power & Thermal
  const [batteryLevel, setBatteryLevel] = useState(15);
  const [isChargingActive, setIsChargingActive] = useState(false);
  const [cpuTemp, setCpuTemp] = useState(35);

  const [users, setUsers] = useState<AccessUser[]>([
    { id: '1', name: 'Admin Principal', phone: '+34600112233', plate: '1234ABC', type: UserType.PERMANENT, active: true },
    { id: '2', name: 'Visitante Demo', phone: '+34611223344', plate: '5678DEF', type: UserType.TEMPORARY, active: true },
  ]);
  const [logs, setLogs] = useState<AccessLog[]>([
    { id: 'l1', timestamp: new Date().toISOString(), userName: 'Admin Principal', plate: '1234ABC', action: 'ENTRY', method: 'ADMIN' }
  ]);
  const [isAwaiting2FA, setIsAwaiting2FA] = useState<AccessUser | null>(null);

  // Live Intercom State
  const [isIntercomActive, setIsIntercomActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const intercomSessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulación de Sensores Kit 400
  useEffect(() => {
    const sensorSim = setInterval(() => {
      if (doorState === DoorStatus.OPEN) {
        setIsIrBlocked(Math.random() > 0.9);
      } else {
        setIsIrBlocked(false);
      }
    }, 5000);
    return () => clearInterval(sensorSim);
  }, [doorState]);

  // Lógica de Energía
  useEffect(() => {
    const powerSim = setInterval(() => {
      setBatteryLevel(prev => {
        if (isChargingActive) return Math.min(100, prev + 0.2);
        return Math.max(0, prev - 0.05);
      });
      setCpuTemp(prev => {
        let target = 30 + (isProcessing ? 15 : 0) + (isChargingActive ? 10 : 0);
        return prev < target ? prev + 0.5 : prev - 0.2;
      });
    }, 2000);
    return () => clearInterval(powerSim);
  }, [isChargingActive, isProcessing]);

  const startIntercom = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsIntercomActive(true);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = audioContextInRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
              setMicLevel(Math.sqrt(sum / inputData.length) * 100);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);
          },
          onmessage: async (m: LiveServerMessage) => {
            const b64 = m.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (b64) {
              const ctx = audioContextOutRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buf = await decodeAudioData(decode(b64), ctx, 24000, 1);
              const src = ctx.createBufferSource();
              src.buffer = buf;
              src.connect(ctx.destination);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              sourcesRef.current.add(src);
              src.onended = () => sourcesRef.current.delete(src);
            }
          },
          onclose: () => stopIntercom()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Eres el interfono de seguridad de un garaje con motor KIT 400. Ayuda al administrador a validar visitas.'
        }
      });
      intercomSessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); }
  };

  const stopIntercom = () => {
    intercomSessionRef.current?.close();
    setIsIntercomActive(false);
    setMicLevel(0);
    audioContextInRef.current?.close();
    audioContextOutRef.current?.close();
  };

  const triggerRelay = (action: 'OPEN' | 'CLOSE' | 'STOP', user?: AccessUser) => {
    if (action === 'CLOSE' && isIrBlocked) return;
    const statusMap = { OPEN: DoorStatus.OPENING, CLOSE: DoorStatus.CLOSING, STOP: DoorStatus.STOPPED };
    setDoorState(statusMap[action]);
    if (user && action === 'OPEN') {
      setLogs([{ id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), userName: user.name, plate: user.plate, action: 'ENTRY', method: 'LPR' }, ...logs]);
      setIsAwaiting2FA(null);
    }
    setTimeout(() => setDoorState(action === 'OPEN' ? DoorStatus.OPEN : DoorStatus.CLOSED), 4000);
  };

  const handleLPR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const b64 = (reader.result as string).split(',')[1];
      const plate = await recognizeLicensePlate(b64);
      if (plate) {
        const found = users.find(u => u.plate === plate);
        if (found) setIsAwaiting2FA(found);
      }
      setTimeout(() => setIsProcessing(false), 2000);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] pb-28">
      <header className="bg-slate-900 p-6 sticky top-0 z-50 shadow-xl border-b border-indigo-500/20">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <i className="fas fa-gate text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-white font-black uppercase tracking-tighter text-xl">KIT <span className="text-indigo-400">CORREDERA 400</span></h1>
              <p className="text-[9px] text-slate-400 font-bold tracking-widest uppercase">XIAO Bridge & LPR System</p>
            </div>
          </div>
          <div className="hidden md:flex gap-8">
            {['dashboard', 'users', 'logs', 'power', 'hardware'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'text-indigo-400 underline underline-offset-8 scale-110' : 'text-slate-500 hover:text-slate-300'}`}>{t}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-[3.5rem] p-12 shadow-sm border border-slate-200 flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-10 left-10 flex flex-col gap-3">
                 {isIrBlocked && (
                   <div className="px-4 py-2 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center gap-3 animate-pulse">
                      <i className="fas fa-triangle-exclamation"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">IR BLOQUEADO</span>
                   </div>
                 )}
                 <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 ${isChargingActive ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                    <i className={`fas ${isChargingActive ? 'fa-bolt-lightning animate-pulse' : 'fa-battery-full'}`}></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">{batteryLevel.toFixed(0)}% LiPo</span>
                 </div>
              </div>

              <div className={`w-72 h-72 rounded-full flex items-center justify-center transition-all duration-1000 ${doorState === DoorStatus.OPEN ? 'bg-teal-50' : 'bg-slate-50'}`}>
                <div className={`absolute w-80 h-80 rounded-full border-2 border-dashed ${doorState === DoorStatus.OPENING || doorState === DoorStatus.CLOSING ? 'border-indigo-400 animate-spin-slow' : 'border-slate-100'}`}></div>
                <i className={`fas ${doorState === DoorStatus.OPEN ? 'fa-door-open text-teal-500' : 'fa-door-closed text-slate-300'} text-8xl`}></i>
              </div>

              <h2 className="text-5xl font-black mt-10 text-slate-900 tracking-tighter uppercase">{doorState}</h2>

              <div className="mt-12 bg-slate-900 p-8 rounded-[3rem] shadow-2xl border-4 border-slate-800 flex flex-col gap-6 w-full max-w-[280px]">
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => triggerRelay('OPEN')} className="aspect-square bg-slate-800 rounded-2xl flex flex-col items-center justify-center text-indigo-400 hover:bg-slate-700 active:scale-95 transition-all group">
                    <i className="fas fa-caret-up text-3xl mb-2"></i>
                    <span className="text-[8px] font-black uppercase tracking-widest">OPEN</span>
                  </button>
                  <button onClick={() => triggerRelay('STOP')} className="aspect-square bg-slate-800 rounded-2xl flex flex-col items-center justify-center text-rose-500 hover:bg-slate-700 active:scale-95 transition-all group">
                    <i className="fas fa-stop text-2xl mb-2"></i>
                    <span className="text-[8px] font-black uppercase tracking-widest">STOP</span>
                  </button>
                  <button onClick={() => triggerRelay('CLOSE')} className="aspect-square bg-slate-800 rounded-2xl flex flex-col items-center justify-center text-indigo-400 hover:bg-slate-700 active:scale-95 transition-all group">
                    <i className="fas fa-caret-down text-3xl mb-2"></i>
                    <span className="text-[8px] font-black uppercase tracking-widest">CLOSE</span>
                  </button>
                  <button onClick={isIntercomActive ? stopIntercom : startIntercom} className={`aspect-square rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all group ${isIntercomActive ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                    <i className={`fas ${isIntercomActive ? 'fa-microphone-slash' : 'fa-microphone'} text-2xl mb-2`}></i>
                    <span className="text-[8px] font-black uppercase tracking-widest">VOICE</span>
                  </button>
                </div>
              </div>
              
              <button onClick={() => fileInputRef.current?.click()} className="mt-8 text-slate-300 hover:text-indigo-400 font-bold text-[9px] uppercase tracking-widest flex items-center gap-2">
                 <i className="fas fa-camera"></i> TEST LPR (CAM-XIAO)
              </button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleLPR} />
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Configuración de Placa (DIP)</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-3">
                       <i className="fas fa-clock-rotate-left text-indigo-600"></i>
                       <span className="text-[10px] font-black uppercase">Auto-cierre</span>
                    </div>
                    <select 
                      value={autoCloseTime} 
                      onChange={(e) => setAutoCloseTime(Number(e.target.value) as any)}
                      className="bg-transparent border-none text-[10px] font-black text-slate-900 focus:ring-0"
                    >
                      <option value={0}>OFF</option>
                      <option value={20}>20 Seg</option>
                      <option value={40}>40 Seg</option>
                      <option value={60}>1 Min</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Usuarios Autorizados</h2>
              <button className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20">Añadir Usuario</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.map(user => (
                <div key={user.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:border-indigo-200 transition-all">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-slate-400">{user.name.charAt(0)}</div>
                    <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${user.type === UserType.PERMANENT ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>{user.type}</span>
                  </div>
                  <h4 className="font-black text-slate-900 uppercase tracking-tight">{user.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">{user.phone}</p>
                  <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
                    <span className="font-mono text-sm font-black text-indigo-600">{user.plate}</span>
                    <button className="text-rose-400 hover:text-rose-600"><i className="fas fa-trash"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-6">Historial de Accesos</h2>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                {logs.map(log => (
                  <div key={log.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${log.action === 'ENTRY' ? 'bg-teal-50 text-teal-600' : 'bg-rose-50 text-rose-600'}`}>
                        <i className={`fas ${log.action === 'ENTRY' ? 'fa-arrow-right-to-bracket' : 'fa-shield-halved'}`}></i>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{log.userName}</p>
                        <p className="text-[10px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">{log.method}</p>
                      <p className="font-mono text-xs font-black text-slate-600">{log.plate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'power' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
            <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm">
              <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tighter">Estado de Batería</h3>
              <div className="flex items-end gap-6 mb-8">
                <span className="text-6xl font-black text-slate-900 tracking-tighter">{batteryLevel.toFixed(0)}%</span>
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${isChargingActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                  {isChargingActive ? 'Cargando...' : 'Descargando'}
                </span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${batteryLevel > 20 ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: `${batteryLevel}%` }}></div>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                 <button 
                  onClick={() => setIsChargingActive(!isChargingActive)}
                  className={`p-6 rounded-[2rem] font-black uppercase text-[10px] tracking-widest transition-all ${isChargingActive ? 'bg-rose-50 text-rose-600' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'}`}
                 >
                   {isChargingActive ? 'Detener Carga' : 'Iniciar Carga Manual'}
                 </button>
                 <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                    <p className="text-sm font-black text-slate-900">{cpuTemp.toFixed(1)}°C</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">CPU XIAO</p>
                 </div>
              </div>
            </div>

            <div className="bg-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
              <h3 className="text-xl font-black mb-6 uppercase tracking-tighter text-indigo-400">Protección Térmica IA</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-8">
                El sistema monitoriza constantemente la temperatura del procesador ESP32-S3. Si se detecta una carga térmica excesiva durante el procesamiento de video o voz, la carga de la batería se suspende automáticamente para preservar la vida útil del hardware.
              </p>
              <div className="space-y-4">
                 <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                    <span className="text-xs font-bold text-slate-300">Límite Seguro</span>
                    <span className="text-xs font-black text-indigo-400">65.0°C</span>
                 </div>
                 <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                    <span className="text-xs font-bold text-slate-300">Histeresis Carga</span>
                    <span className="text-xs font-black text-indigo-400">10% - 95%</span>
                 </div>
              </div>
              <i className="fas fa-temperature-half absolute -bottom-10 -right-10 text-[12rem] opacity-5"></i>
            </div>
          </div>
        )}

        {activeTab === 'hardware' && <HardwareRequirements />}
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin 10s linear infinite; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
