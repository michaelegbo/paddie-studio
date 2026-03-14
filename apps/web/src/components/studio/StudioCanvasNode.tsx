import { Handle, Position } from '@xyflow/react';
import type { StudioNodeType } from '@/lib/api';
import { cn } from '@/lib/utils';

type NodeExecutionVisualState = 'idle' | 'active' | 'completed' | 'failed';

export function StudioCanvasNode({ data, selected }: { data: any; selected?: boolean }) {
  const colors: Record<StudioNodeType, string> = {
    chat: 'from-sky-500/40 to-cyan-500/20 border-sky-400/50',
    webhook: 'from-cyan-500/40 to-sky-500/20 border-cyan-400/50',
    http: 'from-emerald-500/40 to-lime-500/20 border-emerald-400/50',
    memory: 'from-violet-500/40 to-purple-500/20 border-violet-400/50',
    websocket: 'from-amber-500/40 to-orange-500/20 border-amber-400/50',
    condition: 'from-indigo-500/40 to-blue-500/20 border-indigo-400/50',
    ai: 'from-blue-500/40 to-cyan-500/20 border-blue-400/50',
    orchestrator: 'from-rose-500/40 to-orange-500/20 border-rose-400/50',
    loop: 'from-teal-500/40 to-cyan-500/20 border-teal-400/50',
    output: 'from-fuchsia-500/40 to-pink-500/20 border-fuchsia-400/50',
  };
  const kind = (data?.kind || 'http') as StudioNodeType;
  const executionState = (data?.executionState || 'idle') as NodeExecutionVisualState;
  const executionOrder = Number.isFinite(Number(data?.executionOrder)) ? Number(data.executionOrder) : null;

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-gradient-to-br px-3 py-2 min-w-[190px] shadow-lg backdrop-blur-sm transition-all',
        colors[kind],
        selected ? 'ring-2 ring-white/70' : 'ring-1 ring-white/10',
        executionState === 'active' && 'ring-2 ring-cyan-300/90 shadow-[0_0_25px_rgba(56,189,248,0.35)]',
        executionState === 'completed' && 'ring-1 ring-emerald-300/55',
        executionState === 'failed' && 'ring-2 ring-red-300/85'
      )}
    >
      {executionOrder !== null && executionOrder > 0 && (
        <div className="absolute -right-2 -top-2 h-5 min-w-[20px] rounded-full bg-cyan-500/90 px-1 text-[10px] font-semibold text-white flex items-center justify-center">
          {executionOrder}
        </div>
      )}
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-white/80" />
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-200/90">{kind}</div>
      <div className="text-sm font-semibold text-white mt-1">{data.label}</div>
      {executionState === 'active' && <div className="text-[10px] text-cyan-200 mt-1">running...</div>}
      {executionState === 'failed' && <div className="text-[10px] text-red-200 mt-1">failed</div>}
      {kind === 'condition' ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-emerald-300"
            style={{ top: '32%' }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-rose-300"
            style={{ top: '72%' }}
          />
          <div className="mt-1 text-[10px] text-zinc-300 flex justify-between">
            <span className="text-emerald-300">true</span>
            <span className="text-rose-300">false</span>
          </div>
        </>
      ) : kind === 'loop' ? (
        <>
          <Handle
            id="item"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-cyan-300"
            style={{ top: '32%' }}
          />
          <Handle
            id="done"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-zinc-200"
            style={{ top: '72%' }}
          />
          <div className="mt-1 text-[10px] text-zinc-300 flex justify-between">
            <span className="text-cyan-300">item</span>
            <span className="text-zinc-200">done</span>
          </div>
        </>
      ) : kind === 'orchestrator' ? (
        <>
          <Handle
            id="tool"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-amber-300"
            style={{ top: '32%' }}
          />
          <Handle
            id="next"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-sky-300"
            style={{ top: '72%' }}
          />
          <div className="mt-1 text-[10px] text-zinc-300 flex justify-between">
            <span className="text-amber-300">tool</span>
            <span className="text-sky-300">next</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-white/80" />
      )}
    </div>
  );
}
