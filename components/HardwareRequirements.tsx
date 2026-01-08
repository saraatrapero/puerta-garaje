
import React from 'react';

const HardwareRequirements: React.FC = () => {
  const xiaoPins = [
    { pin: 'D0', device: 'Terminal OPN (X7)', desc: 'Pulso de Apertura. Conectar a borne OPN de la placa.' },
    { pin: 'D1', device: 'Terminal CLS (X7)', desc: 'Pulso de Cierre. Conectar a borne CLS de la placa.' },
    { pin: 'D2', device: 'Terminal STP (X7)', desc: 'Parada de Emergencia. Conectar a borne STP.' },
    { pin: 'D3', device: 'Cargador MOSFET', desc: 'Gestiona la entrada de 5V para carga LiPo.' },
    { pin: 'D4', device: 'Reed Sensor', desc: 'Monitoriza el estado físico Real de la puerta.' },
    { pin: 'GND', device: 'Común (COM)', desc: 'Unir al borne COM de la regleta X7.' }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Guía Técnica Manual Kit 400 */}
      <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Conexión a Regleta X7</h3>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Nomenclatura oficial Manual Pág. 7</p>
          </div>
          <span className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20">
             Motor Modelo 400
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {xiaoPins.map((p, idx) => (
            <div key={idx} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-indigo-200 transition-all group">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 font-black shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all mb-4">
                {p.pin}
              </div>
              <p className="font-bold text-slate-800 uppercase tracking-tighter mb-1">{p.device}</p>
              <p className="text-[10px] text-slate-500 leading-tight">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 p-8 bg-rose-50 rounded-[2.5rem] border border-rose-100 flex flex-col md:flex-row gap-6 items-center">
           <div className="w-16 h-16 bg-rose-600 rounded-full flex items-center justify-center text-white text-xl shrink-0">
              <i className="fas fa-shield-halved"></i>
           </div>
           <div>
              <p className="font-black text-rose-900 uppercase text-xs tracking-widest mb-1">Seguridad Fotocélulas (Borne IR - Regleta X5)</p>
              <p className="text-sm text-rose-700 leading-relaxed">
                El manual especifica que si se detecta un obstáculo en el borne **IR**, el motor invierte la maniobra. 
                Asegúrate de mantener el puente original si no instalas fotocélulas físicas para que la App pueda operar correctamente.
              </p>
           </div>
        </div>
      </div>

      {/* Esquema 220V -> 5V */}
      <div className="p-10 bg-slate-900 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl font-black mb-6 flex items-center gap-4">
            <i className="fas fa-plug-circle-bolt text-indigo-400"></i>
            Alimentación Integrada
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl mb-8">
            Deriva fase y neutro de la regleta **X1 (220V)** hacia un transformador de 5V. 
            Este alimentará el XIAO S3 Sense, permitiendo que el sistema de LPR y Voz funcione 24/7 sin depender de baterías externas, pero con el respaldo de la LiPo para cortes de luz.
          </p>
          <div className="flex gap-4">
             <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
                <i className="fas fa-battery-half text-teal-400"></i>
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-100">Carga Inteligente 10%-100%</span>
             </div>
          </div>
        </div>
        <i className="fas fa-microchip absolute -bottom-10 -right-10 text-[12rem] opacity-5"></i>
      </div>
    </div>
  );
};

export default HardwareRequirements;
