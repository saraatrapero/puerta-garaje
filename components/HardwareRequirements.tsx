
import React from 'react';

const HardwareRequirements: React.FC = () => {
  const requirements = [
    { item: 'Seeed Studio XIAO ESP32-S3 Sense', reason: 'Kit ultra-compacto con Cámara OV2640 y Micrófono Digital (MSM261D3526H1CPM) integrados.' },
    { item: 'Módulo de Relé de 3.3V/5V', reason: 'Para activar el motor. El XIAO usa niveles lógicos de 3.3V.' },
    { item: 'Tarjeta MicroSD (Max 32GB)', reason: 'Para registro local de imágenes de matrículas y logs de seguridad offline.' },
    { item: 'Batería LiPo 3.7V (Opcional)', reason: 'El XIAO tiene cargador de batería integrado para seguir operando si hay un corte de luz.' }
  ];

  const xiaoPins = [
    { pin: 'D0', device: 'Relé (Trigger)', desc: 'Salida digital para accionar la puerta.' },
    { pin: 'D1', device: 'Reed Switch', desc: 'Entrada para sensor de puerta cerrada.' },
    { pin: 'D2', device: 'Botón Manual', desc: 'Pulsador físico opcional para abrir desde dentro.' },
    { pin: 'BATT', device: 'LiPo + / -', desc: 'Conexión para batería de respaldo.' }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Explicación XIAO Sense */}
      <div className="p-8 bg-gradient-to-br from-teal-900 to-slate-900 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden border border-teal-500/20">
        <div className="relative z-10">
          <h3 className="text-2xl font-black mb-4 flex items-center gap-3">
            <i className="fas fa-microchip text-teal-400"></i>
            XIAO ESP32-S3 Sense Power
          </h3>
          <p className="text-sm text-teal-100/80 mb-6 max-w-2xl leading-relaxed">
            Este hardware permite una <strong>detección híbrida</strong>. Usamos el micrófono para detectar el ruido de un motor cercano y despertar la cámara para el análisis LPR con Gemini, ahorrando energía y procesado.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="bg-teal-500/10 p-4 rounded-2xl border border-teal-500/20 backdrop-blur-md">
              <i className="fas fa-microphone-lines text-teal-400 mb-2 text-lg"></i>
              <span className="font-black block mb-1 uppercase">Audio Trigger</span>
              Detección de llegada por sonido de motor o claxon.
            </div>
            <div className="bg-teal-500/10 p-4 rounded-2xl border border-teal-500/20 backdrop-blur-md">
              <i className="fas fa-sd-card text-teal-400 mb-2 text-lg"></i>
              <span className="font-black block mb-1 uppercase">Local Storage</span>
              Backup de fotos en MicroSD ante fallos de red.
            </div>
            <div className="bg-teal-500/10 p-4 rounded-2xl border border-teal-500/20 backdrop-blur-md">
              <i className="fas fa-battery-full text-teal-400 mb-2 text-lg"></i>
              <span className="font-black block mb-1 uppercase">UPS Integrado</span>
              Carga y gestión de batería LiPo nativa.
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-20">
           <i className="fas fa-bolt-lightning text-9xl"></i>
        </div>
      </div>

      {/* Esquema XIAO */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-slate-800">
          <i className="fas fa-terminal text-teal-600"></i>
          Wiring: Formato XIAO
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="relative p-10 bg-slate-900 rounded-[2rem] flex flex-col items-center justify-center border-4 border-slate-800 shadow-inner">
             {/* Representación visual minimalista del XIAO */}
             <div className="w-32 h-44 bg-slate-800 rounded-lg border-2 border-teal-500 relative flex flex-col items-center p-2 shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                <div className="w-8 h-8 bg-slate-700 rounded-sm mb-4 border border-slate-600 flex items-center justify-center">
                  <div className="w-4 h-4 bg-teal-500/50 rounded-full blur-[2px]"></div>
                </div>
                <div className="flex flex-col gap-2 w-full px-2">
                   {[...Array(5)].map((_, i) => (
                     <div key={i} className="flex justify-between w-full">
                        <div className="w-3 h-1 bg-yellow-500/50 rounded-full"></div>
                        <div className="w-3 h-1 bg-yellow-500/50 rounded-full"></div>
                     </div>
                   ))}
                </div>
                <div className="absolute -top-2 w-12 h-4 bg-slate-600 rounded-t-md"></div>
             </div>
             <p className="mt-8 text-[10px] text-teal-400 font-mono text-center tracking-tighter uppercase">
               XIAO ESP32-S3 Sense<br/>Layout Vista Superior
             </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-4">Mapeo de Terminales</h4>
            {xiaoPins.map((p, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-10 h-10 bg-white shadow-sm border border-slate-200 rounded-lg flex items-center justify-center font-black text-xs text-teal-600">
                  {p.pin}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm leading-none mb-1">{p.device}</p>
                  <p className="text-[10px] text-slate-500 leading-none">{p.desc}</p>
                </div>
              </div>
            ))}
            <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
               <i className="fas fa-lightbulb text-amber-500 mt-1"></i>
               <p className="text-[11px] text-amber-800 italic">
                 Nota: El XIAO entrega 3.3V en sus pines. Asegúrate de que tu relé sea compatible o usa un transistor para conmutar 5V.
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Componentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {requirements.map((req, idx) => (
          <div key={idx} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 hover:border-teal-200 transition-colors group">
            <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-all">
              <i className="fas fa-layer-group"></i>
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">{req.item}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{req.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HardwareRequirements;
