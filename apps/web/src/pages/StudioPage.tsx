import * as React from "react"
import sdk from "@stackblitz/sdk"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  Handle,
  Node,
  OnEdgesChange,
  OnNodesChange,
  Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  studioAPI,
  StudioCodegen,
  StudioExecutionTraceStep,
  StudioFlow,
  StudioFlowHistory,
  StudioNode,
  StudioNodeType,
  StudioRun,
  userAPI,
} from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Workflow,
  Save,
  Play,
  Plus,
  Link as LinkIcon,
  Copy,
  Code2,
  Box,
  Layers,
  Globe,
  Brain,
  Radio,
  Flag,
  Terminal,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  GripVertical,
  GripHorizontal,
  RotateCcw,
  History,
  Trash2,
  Key,
  GitBranch,
  Repeat,
  Bot,
  Cpu,
  MessageSquare,
  SendHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"

type CanvasNode = Node<any>

interface ApiKey {
  id: string
  name: string
  key_prefix: string
}

interface InputMappingRule {
  sourcePath: string
  targetField: string
  required?: boolean
  defaultValue?: any
}

type NodeExecutionVisualState = "idle" | "active" | "completed" | "failed"

interface ExecutionPlaybackStep {
  nodeId: string
  edgeIds: string[]
  status: "success" | "failed"
  durationMs: number
}

interface MappingFieldCandidate {
  sourceLabel: string
  sourcePath: string
  preview: string
  value: any
}

interface StudioChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  runId?: string
  createdAt: string
  status?: "pending" | "done"
}

interface NodeContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface StudioResizeState {
  panel: "left" | "output"
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

interface StudioChatPanelRect {
  x: number
  y: number
  width: number
  height: number
}

interface StudioChatPanelGestureState {
  mode: "drag" | "resize"
  startX: number
  startY: number
  startRect: StudioChatPanelRect
}

type ModalSuggestionMode = "template" | "path"

interface ModalSuggestionState {
  fieldId: string
  mode: ModalSuggestionMode
  query: string
}

const DEFAULT_EDGE_STYLE = {
  stroke: "rgba(148, 163, 184, 0.8)",
  strokeWidth: 2,
}

const VALID_NODE_TYPES: StudioNodeType[] = [
  "chat",
  "webhook",
  "http",
  "memory",
  "websocket",
  "condition",
  "ai",
  "orchestrator",
  "loop",
  "output",
]

const DEFAULT_LEFT_PANEL_WIDTH = 320
const MIN_LEFT_PANEL_WIDTH = 240
const MAX_LEFT_PANEL_WIDTH = 520
const DEFAULT_OUTPUT_PANEL_HEIGHT = 360
const MIN_OUTPUT_PANEL_HEIGHT = 220
const MAX_OUTPUT_PANEL_HEIGHT = 720
const DEFAULT_CHAT_PANEL_WIDTH = 380
const DEFAULT_CHAT_PANEL_HEIGHT = 520
const MIN_CHAT_PANEL_WIDTH = 280
const MAX_CHAT_PANEL_WIDTH = 720
const MIN_CHAT_PANEL_HEIGHT = 280
const MAX_CHAT_PANEL_HEIGHT = 820
const CHAT_PANEL_MARGIN = 12
const CHAT_PANEL_TOP_OFFSET = 64
const DEFAULT_WEBHOOK_BODY_INPUT = '{\n  "message": "hello from studio"\n}'
const DEFAULT_CHAT_MESSAGE_INPUT = "What do you know about Bret from the sample data?"
const SIMPLE_SAMPLE_WEBHOOK_BODY_INPUT =
  '{\n  "todoId": 1,\n  "note": "first studio sample",\n  "requestedBy": "demo-user",\n  "category": "demo",\n  "priority": "high"\n}'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function parseJsonText(text: string): any | null {
  try {
    return text.trim() ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function toTemplateToken(sourcePath: string): string {
  const normalized = String(sourcePath || "").trim()
  return normalized ? `{{${normalized}}}` : ""
}

function insertTextAtCursor(
  currentValue: string,
  nextText: string,
  selectionStart?: number | null,
  selectionEnd?: number | null
): string {
  if (!nextText) return currentValue
  if (selectionStart === null || selectionStart === undefined) {
    return `${currentValue}${nextText}`
  }
  const end = selectionEnd ?? selectionStart
  return `${currentValue.slice(0, selectionStart)}${nextText}${currentValue.slice(end)}`
}

function replaceOpenTemplateAtCursor(
  currentValue: string,
  sourcePath: string,
  selectionStart?: number | null
): string {
  const token = toTemplateToken(sourcePath)
  if (!token) return currentValue
  const cursor = selectionStart ?? currentValue.length
  const beforeCursor = currentValue.slice(0, cursor)
  const afterCursor = currentValue.slice(cursor)
  const openIndex = beforeCursor.lastIndexOf("{{")
  const closedIndex = beforeCursor.lastIndexOf("}}")

  if (openIndex >= 0 && closedIndex < openIndex) {
    const closeIndexInAfter = afterCursor.indexOf("}}")
    const suffix = closeIndexInAfter >= 0 ? afterCursor.slice(closeIndexInAfter + 2) : afterCursor
    return `${currentValue.slice(0, openIndex)}${token}${suffix}`
  }

  return insertTextAtCursor(currentValue, token, selectionStart, selectionStart)
}

function stringifyEditorValue(value: any): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getDefaultRunInputForFlow(flow?: StudioFlow | null): string {
  if (
    flow?.nodes?.some(
      (node) =>
        node.id === "sample_simple_webhook" ||
        node.id === "sample_simple_url_http" ||
        node.id === "sample_simple_body_webhook" ||
        node.id === "sample_simple_body_http"
    )
  ) {
    return SIMPLE_SAMPLE_WEBHOOK_BODY_INPUT
  }
  return DEFAULT_WEBHOOK_BODY_INPUT
}

function normalizeRunExecutedNodeIds(result: any): string[] {
  const raw =
    result?.executed_nodes ??
    result?.executedNodeIds ??
    result?.executed_node_ids
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item || "").trim()).filter(Boolean)
}

function normalizeRunTrace(result: any): StudioExecutionTraceStep[] {
  const rawTrace = result?.execution_trace ?? result?.executionTrace
  if (!Array.isArray(rawTrace)) return []

  return rawTrace
    .map((item: any) => {
      const rawNodeType = String(item?.nodeType ?? item?.node_type ?? "").toLowerCase()
      const nodeType = (VALID_NODE_TYPES.includes(rawNodeType as StudioNodeType)
        ? rawNodeType
        : "http") as StudioNodeType
      const rawStatus = String(item?.status || "success").toLowerCase()
      const status = rawStatus === "failed" ? "failed" : "success"
      const rawDispatches = Array.isArray(item?.dispatches) ? item.dispatches : []
      const dispatches = rawDispatches
        .map((dispatch: any) => ({
          branch: String(dispatch?.branch || "always"),
          edgeId: String(dispatch?.edgeId ?? dispatch?.edge_id ?? "").trim(),
          sourceNodeId: String(dispatch?.sourceNodeId ?? dispatch?.source_node_id ?? "").trim(),
          targetNodeId: String(dispatch?.targetNodeId ?? dispatch?.target_node_id ?? "").trim(),
          inputSnapshot: dispatch?.inputSnapshot ?? dispatch?.input_snapshot,
        }))
        .filter((dispatch: any) => dispatch.edgeId && dispatch.targetNodeId)

      return {
        step: Number(item?.step || 0),
        nodeId: String(item?.nodeId ?? item?.node_id ?? "").trim(),
        nodeType,
        status,
        startedAt: String(item?.startedAt ?? item?.started_at ?? ""),
        endedAt: String(item?.endedAt ?? item?.ended_at ?? ""),
        durationMs: Number(item?.durationMs ?? item?.duration_ms ?? 0) || 0,
        inputSnapshot: item?.inputSnapshot ?? item?.input_snapshot,
        dispatches,
        error: item?.error ? String(item.error) : undefined,
      } as StudioExecutionTraceStep
    })
    .filter((step) => step.nodeId.length > 0)
}

function buildExecutionPlaybackSteps(result: any, edges: Edge[]): ExecutionPlaybackStep[] {
  const trace = normalizeRunTrace(result)
  if (trace.length > 0) {
    return trace.map((traceStep, index) => {
      const edgeIds = new Set<string>()
      for (let i = index - 1; i >= 0; i -= 1) {
        const matches = trace[i].dispatches.filter(
          (dispatch) => dispatch.targetNodeId === traceStep.nodeId && dispatch.edgeId
        )
        if (matches.length > 0) {
          for (const match of matches) {
            edgeIds.add(match.edgeId)
          }
          break
        }
      }

      return {
        nodeId: traceStep.nodeId,
        edgeIds: [...edgeIds],
        status: traceStep.status,
        durationMs: traceStep.durationMs || 0,
      }
    })
  }

  const executedNodeIds = normalizeRunExecutedNodeIds(result)
  if (executedNodeIds.length === 0) return []

  const edgePairMap = new Map<string, string[]>()
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`
    const existing = edgePairMap.get(key)
    if (existing) {
      existing.push(edge.id)
    } else {
      edgePairMap.set(key, [edge.id])
    }
  }

  return executedNodeIds.map((nodeId, index) => {
    let edgeIds: string[] = []
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = edgePairMap.get(`${executedNodeIds[i]}->${nodeId}`)
      if (candidate && candidate.length > 0) {
        edgeIds = [...candidate]
        break
      }
    }

    return {
      nodeId,
      edgeIds,
      status: "success",
      durationMs: 0,
    }
  })
}

function getRunNodeResults(result: any): Record<string, any> {
  if (result?.node_results && typeof result.node_results === "object") {
    return result.node_results
  }
  if (result?.nodeResults && typeof result.nodeResults === "object") {
    return result.nodeResults
  }
  return {}
}

function getRunDurationMs(result: any): number {
  const value = Number(result?.duration_ms ?? result?.durationMs ?? 0)
  return Number.isFinite(value) ? value : 0
}

function getRunError(result: any): string {
  const value = result?.error
  return value ? String(value) : ""
}

function extractChatReply(result: any): string {
  const candidates = [
    result?.output?.reply,
    result?.output?.message,
    result?.output?.output,
    result?.output?.text,
    result?.data?.output?.reply,
    result?.data?.output?.message,
    result?.data?.output?.output,
    result?.data?.output?.text,
    result?.reply,
    result?.message,
    result?.text,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  const fallback = result?.data?.output ?? result?.output ?? result
  if (fallback === undefined || fallback === null) {
    return ""
  }
  if (typeof fallback === "string") {
    return fallback
  }

  try {
    return JSON.stringify(fallback, null, 2)
  } catch {
    return String(fallback)
  }
}

function toInlinePreview(value: any): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim()
    return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
    return keys.length === 0 ? "{}" : `{${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", ..." : ""}}`
  }
  return String(value)
}

function flattenFieldCandidates(
  value: any,
  basePath: string,
  sourceLabel: string,
  output: MappingFieldCandidate[],
  depth = 0
): void {
  if (!basePath) return
  if (output.length >= 240) return

  output.push({
    sourceLabel,
    sourcePath: basePath,
    preview: toInlinePreview(value),
    value,
  })

  if (depth >= 3 || value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    const maxItems = Math.min(value.length, 5)
    for (let index = 0; index < maxItems; index += 1) {
      flattenFieldCandidates(value[index], `${basePath}[${index}]`, sourceLabel, output, depth + 1)
      if (output.length >= 240) return
    }
    return
  }

  if (typeof value !== "object") {
    return
  }

  const keys = Object.keys(value).slice(0, 16)
  for (const key of keys) {
    flattenFieldCandidates(value[key], `${basePath}.${key}`, sourceLabel, output, depth + 1)
    if (output.length >= 240) return
  }
}

function getTargetFieldSuggestion(sourcePath: string): string {
  const normalized = String(sourcePath || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.|\.$/g, "")
  if (!normalized) return "value"
  const parts = normalized.split(".").filter(Boolean)
  const tail = parts[parts.length - 1] || "value"
  if (/^\d+$/.test(tail)) {
    return parts[parts.length - 2] || "value"
  }
  return tail
}

function collectFieldPaths(value: any, prefix: string, output: Set<string>, depth = 0): void {
  if (!prefix) return
  output.add(prefix)

  if (depth >= 3 || value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      collectFieldPaths(value[0], `${prefix}[0]`, output, depth + 1)
    }
    return
  }

  if (typeof value !== "object") {
    return
  }

  const keys = Object.keys(value).slice(0, 12)
  for (const key of keys) {
    const next = `${prefix}.${key}`
    output.add(next)
    collectFieldPaths(value[key], next, output, depth + 1)
  }
}

function StudioCanvasNode({ data, selected }: { data: any; selected?: boolean }) {
  const colors: Record<StudioNodeType, string> = {
    chat: "from-sky-500/40 to-cyan-500/20 border-sky-400/50",
    webhook: "from-cyan-500/40 to-sky-500/20 border-cyan-400/50",
    http: "from-emerald-500/40 to-lime-500/20 border-emerald-400/50",
    memory: "from-violet-500/40 to-purple-500/20 border-violet-400/50",
    websocket: "from-amber-500/40 to-orange-500/20 border-amber-400/50",
    condition: "from-indigo-500/40 to-blue-500/20 border-indigo-400/50",
    ai: "from-blue-500/40 to-cyan-500/20 border-blue-400/50",
    orchestrator: "from-rose-500/40 to-orange-500/20 border-rose-400/50",
    loop: "from-teal-500/40 to-cyan-500/20 border-teal-400/50",
    output: "from-fuchsia-500/40 to-pink-500/20 border-fuchsia-400/50",
  }
  const kind = (data?.kind || "http") as StudioNodeType
  const executionState = (data?.executionState || "idle") as NodeExecutionVisualState
  const executionOrder = Number.isFinite(Number(data?.executionOrder))
    ? Number(data.executionOrder)
    : null

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-gradient-to-br px-3 py-2 min-w-[190px] shadow-lg backdrop-blur-sm transition-all",
        colors[kind],
        selected ? "ring-2 ring-white/70" : "ring-1 ring-white/10",
        executionState === "active" && "ring-2 ring-cyan-300/90 shadow-[0_0_25px_rgba(56,189,248,0.35)]",
        executionState === "completed" && "ring-1 ring-emerald-300/55",
        executionState === "failed" && "ring-2 ring-red-300/85"
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
      {executionState === "active" && <div className="text-[10px] text-cyan-200 mt-1">running...</div>}
      {executionState === "failed" && <div className="text-[10px] text-red-200 mt-1">failed</div>}
      {kind === "condition" ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-emerald-300"
            style={{ top: "32%" }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-rose-300"
            style={{ top: "72%" }}
          />
          <div className="mt-1 text-[10px] text-zinc-300 flex justify-between">
            <span className="text-emerald-300">true</span>
            <span className="text-rose-300">false</span>
          </div>
        </>
      ) : kind === "loop" ? (
        <>
          <Handle
            id="item"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-cyan-300"
            style={{ top: "32%" }}
          />
          <Handle
            id="done"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-zinc-200"
            style={{ top: "72%" }}
          />
          <div className="mt-1 text-[10px] text-zinc-300 flex justify-between">
            <span className="text-cyan-300">item</span>
            <span className="text-zinc-200">done</span>
          </div>
        </>
      ) : kind === "orchestrator" ? (
        <>
          <Handle
            id="tool"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-amber-300"
            style={{ top: "32%" }}
          />
          <Handle
            id="next"
            type="source"
            position={Position.Right}
            className="w-2 h-2 !bg-sky-300"
            style={{ top: "72%" }}
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
  )
}

const nodeTypes: any = { studioNode: StudioCanvasNode }

const DEFAULT_NODE_CONFIG: Record<StudioNodeType, Record<string, any>> = {
  chat: {
    welcomeMessage: "Ask the flow a question.",
    placeholder: "Type a message to start the flow...",
    messagePath: "trigger.chat.message",
    historyPath: "trigger.chat.history",
    conversationIdPath: "trigger.chat.conversationId",
  },
  webhook: {},
  http: {
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    headers: {
      accept: "application/json",
    },
  },
  memory: {
    authMode: "session",
    action: "router",
    mode: "conversation",
    apiKey: "",
    userId: "",
    query: "{{input.message}}",
  },
  websocket: {
    url: "wss://echo.websocket.events",
    message: "{{trigger.body.event}}",
    waitForResponse: true,
  },
  condition: {
    leftPath: "trigger.body.value",
    operator: "exists",
    valueType: "string",
    rightValue: "",
  },
  ai: {
    credentialSource: "paddie_system",
    provider: "azure_openai",
    deployment: "gpt-4.1",
    inputPath: "input",
    historyPath: "input.history",
    systemPrompt: "You are a helpful assistant.",
    temperature: 0.3,
    maxTokens: 500,
  },
  orchestrator: {
    credentialSource: "paddie_system",
    provider: "azure_openai",
    deployment: "gpt-4.1",
    instructionPath: "input",
    historyPath: "input.history",
    systemPrompt: "You orchestrate tools and return the final result.",
    maxToolCalls: 6,
    temperature: 0.2,
    maxTokens: 800,
  },
  loop: {
    listPath: "input",
    itemField: "item",
    indexField: "index",
    maxItems: 1000,
  },
  output: {
    template: {
      message: "Flow complete",
      finalNode: "{{input}}",
    },
  },
}

const DEFAULT_NODE_NAME: Record<StudioNodeType, string> = {
  chat: "Chat Input",
  webhook: "Webhook Trigger",
  http: "HTTP Request",
  memory: "Paddie Memory",
  websocket: "WebSocket",
  condition: "If / Else",
  ai: "AI Inference",
  orchestrator: "AI Orchestrator",
  loop: "Loop Items",
  output: "Output",
}

function toCanvasNodes(flow: StudioFlow): CanvasNode[] {
  return flow.nodes.map((node) => ({
    id: node.id,
    type: "studioNode",
    position: node.position || { x: 120, y: 120 },
    data: {
      label: node.name,
      kind: node.type,
      config: node.config || {},
    },
  }))
}

function toCanvasEdges(flow: StudioFlow): Edge[] {
  return flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.condition && edge.condition !== "always" ? edge.condition : undefined,
    data: {
      condition:
        edge.condition ||
        (edge.sourceHandle === "true" ||
        edge.sourceHandle === "false" ||
        edge.sourceHandle === "item" ||
        edge.sourceHandle === "done" ||
        edge.sourceHandle === "tool" ||
        edge.sourceHandle === "next"
          ? edge.sourceHandle
          : "always"),
    },
    animated: false,
    style: { ...DEFAULT_EDGE_STYLE },
  }))
}

function toFlowNodes(nodes: CanvasNode[]): StudioFlow["nodes"] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.data.kind,
    name: node.data.label,
    position: node.position,
    config: node.data.config || {},
  }))
}

function toFlowEdges(edges: Edge[]): StudioFlow["edges"] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle || undefined,
    targetHandle: edge.targetHandle || undefined,
    condition:
      (edge.data as any)?.condition ||
      (edge.sourceHandle === "true" ||
      edge.sourceHandle === "false" ||
      edge.sourceHandle === "item" ||
      edge.sourceHandle === "done" ||
      edge.sourceHandle === "tool" ||
      edge.sourceHandle === "next"
        ? edge.sourceHandle
        : "always"),
  }))
}

export default function StudioPage() {
  const { user } = useAuth()
  const pageRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const layoutRef = React.useRef<HTMLDivElement | null>(null)
  const resizeStateRef = React.useRef<StudioResizeState | null>(null)
  const chatPanelGestureRef = React.useRef<StudioChatPanelGestureState | null>(null)
  const chatInlineScrollRef = React.useRef<HTMLDivElement | null>(null)
  const chatModalScrollRef = React.useRef<HTMLDivElement | null>(null)
  const modalSuggestionDismissTimerRef = React.useRef<number | null>(null)
  const modalChatMessagePathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalChatHistoryPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalChatWelcomeTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalChatPlaceholderInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalHttpUrlInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalHttpBodyTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalMemoryUserIdInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalMemoryBaseUrlInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalMemoryApiKeyInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalMemoryQueryTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalMemoryContentTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalMemoryContextTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalWebsocketUrlInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalWebsocketMessageTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalConditionLeftPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalConditionRightValueInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalLoopListPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalAIInputPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalAIHistoryPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalAIPromptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalAISystemPromptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalAIApiKeyInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalAIEndpointInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalAIAPIVersionInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOrchestratorInstructionPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOrchestratorHistoryPathInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOrchestratorInstructionTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalOrchestratorSystemPromptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const modalOrchestratorApiKeyInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOrchestratorEndpointInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOrchestratorAPIVersionInputRef = React.useRef<HTMLInputElement | null>(null)
  const modalOutputTemplateTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [flows, setFlows] = React.useState<StudioFlow[]>([])
  const [history, setHistory] = React.useState<StudioFlowHistory[]>([])
  const [currentFlow, setCurrentFlow] = React.useState<StudioFlow | null>(null)
  const [nodes, setNodes] = React.useState<CanvasNode[]>([])
  const [edges, setEdges] = React.useState<Edge[]>([])
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>([])
  const [nodeConfigText, setNodeConfigText] = React.useState("{}")
  const [nodeConfigError, setNodeConfigError] = React.useState<string | null>(null)
  const [advancedNodeEditor, setAdvancedNodeEditor] = React.useState(false)
  const [runInput, setRunInput] = React.useState(DEFAULT_WEBHOOK_BODY_INPUT)
  const [runResult, setRunResult] = React.useState<any>(null)
  const [nodeTestInput, setNodeTestInput] = React.useState(DEFAULT_WEBHOOK_BODY_INPUT)
  const [nodeTestResult, setNodeTestResult] = React.useState<any>(null)
  const [runs, setRuns] = React.useState<StudioRun[]>([])
  const [codeLanguage, setCodeLanguage] = React.useState<"javascript" | "python">("javascript")
  const [codegen, setCodegen] = React.useState<StudioCodegen | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [chatRunning, setChatRunning] = React.useState(false)
  const [testingNode, setTestingNode] = React.useState(false)
  const [restoringHistoryId, setRestoringHistoryId] = React.useState<string | null>(null)
  const [deletingFlowId, setDeletingFlowId] = React.useState<string | null>(null)
  const [generatingCode, setGeneratingCode] = React.useState(false)
  const [focusMode, setFocusMode] = React.useState(false)
  const [browserFullscreen, setBrowserFullscreen] = React.useState(false)
  const [isDesktopLayout, setIsDesktopLayout] = React.useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1280px)").matches
  )
  const [leftPanelWidth, setLeftPanelWidth] = React.useState(DEFAULT_LEFT_PANEL_WIDTH)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false)
  const [outputPanelHeight, setOutputPanelHeight] = React.useState(DEFAULT_OUTPUT_PANEL_HEIGHT)
  const [outputPanelCollapsed, setOutputPanelCollapsed] = React.useState(false)
  const [providerModels, setProviderModels] = React.useState<string[]>([])
  const [providerModelsNodeId, setProviderModelsNodeId] = React.useState<string | null>(null)
  const [loadingProviderModels, setLoadingProviderModels] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const playbackTimerRef = React.useRef<number | null>(null)
  const [executionPlaybackSteps, setExecutionPlaybackSteps] = React.useState<ExecutionPlaybackStep[]>([])
  const [executionPlaybackIndex, setExecutionPlaybackIndex] = React.useState(-1)
  const [executionPlaybackRunning, setExecutionPlaybackRunning] = React.useState(false)
  const [mappingSearch, setMappingSearch] = React.useState("")
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = React.useState<"run" | "code">("run")
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null)
  const [nodeContextMenu, setNodeContextMenu] = React.useState<NodeContextMenuState | null>(null)
  const [nodeConfigModalOpen, setNodeConfigModalOpen] = React.useState(false)
  const [modalNodeId, setModalNodeId] = React.useState<string | null>(null)
  const [modalNodeLabel, setModalNodeLabel] = React.useState("")
  const [modalConfigDraft, setModalConfigDraft] = React.useState("{}")
  const [modalConfigError, setModalConfigError] = React.useState<string | null>(null)
  const [modalNodeTestError, setModalNodeTestError] = React.useState<string | null>(null)
  const [modalSuggestionState, setModalSuggestionState] = React.useState<ModalSuggestionState | null>(null)
  const [chatInput, setChatInput] = React.useState(DEFAULT_CHAT_MESSAGE_INPUT)
  const [chatMessages, setChatMessages] = React.useState<StudioChatMessage[]>([])
  const [chatConversationId, setChatConversationId] = React.useState<string>(
    `studio_chat_${Date.now()}`
  )
  const [chatPanelCollapsed, setChatPanelCollapsed] = React.useState(false)
  const [chatModalOpen, setChatModalOpen] = React.useState(false)
  const [chatPanelRect, setChatPanelRect] = React.useState<StudioChatPanelRect>({
    x: CHAT_PANEL_MARGIN,
    y: CHAT_PANEL_TOP_OFFSET,
    width: DEFAULT_CHAT_PANEL_WIDTH,
    height: DEFAULT_CHAT_PANEL_HEIGHT,
  })

  const selectedNode = React.useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )
  const manualWebhookPayload = React.useMemo(() => parseJsonText(runInput), [runInput])
  const modalNode = React.useMemo(
    () => nodes.find((node) => node.id === modalNodeId) || null,
    [modalNodeId, nodes]
  )
  const modalConfigObject = React.useMemo<Record<string, any>>(() => {
    try {
      return modalConfigDraft.trim() ? JSON.parse(modalConfigDraft) : {}
    } catch {
      return {}
    }
  }, [modalConfigDraft])
  const modalNodeKind = (modalNode?.data?.kind || "") as StudioNodeType | ""
  const modalNodeProvider = String(modalConfigObject.provider || "azure_openai")
  const modalCredentialSource =
    String(modalConfigObject.credentialSource || "paddie_system") === "byok"
      ? "byok"
      : "paddie_system"
  const effectiveModalAIProvider =
    modalCredentialSource === "paddie_system" ? "azure_openai" : modalNodeProvider
  const modalModelFieldKey =
    effectiveModalAIProvider === "azure_openai" ? "deployment" : "model"
  const modalModelFieldValue = String(
    modalModelFieldKey === "deployment"
      ? modalConfigObject.deployment || ""
      : modalConfigObject.model || ""
  )
  const modalInputMappings = React.useMemo<InputMappingRule[]>(
    () =>
      Array.isArray(modalConfigObject.inputMapping)
        ? (modalConfigObject.inputMapping as InputMappingRule[])
        : [],
    [modalConfigObject.inputMapping]
  )
  const contextMenuNode = React.useMemo(
    () => nodes.find((node) => node.id === nodeContextMenu?.nodeId) || null,
    [nodeContextMenu?.nodeId, nodes]
  )
  const selectedConfig = (selectedNode?.data?.config || {}) as Record<string, any>
  const selectedNodeKind = (selectedNode?.data?.kind || "") as StudioNodeType | ""
  const selectedNodeProvider = String(selectedConfig.provider || "azure_openai")
  const isSelectedNodeAI =
    selectedNodeKind === "ai" || selectedNodeKind === "orchestrator"
  const chatNode = React.useMemo(
    () => nodes.find((node) => node.data.kind === "chat") || null,
    [nodes]
  )
  const hasChatNode = !!chatNode
  const hasWebhookNode = React.useMemo(
    () => nodes.some((node) => node.data.kind === "webhook"),
    [nodes]
  )
  const chatWelcomeMessage = String(
    chatNode?.data?.config?.welcomeMessage || "Ask the flow a question."
  )
  const chatPlaceholder = String(
    chatNode?.data?.config?.placeholder || "Type a message to start the flow..."
  )
  const getChatCanvasBounds = React.useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      width: Math.max(320, rect?.width ?? window.innerWidth - 48),
      height: Math.max(360, rect?.height ?? window.innerHeight - 220),
    }
  }, [])
  const constrainChatPanelRect = React.useCallback(
    (nextRect: StudioChatPanelRect): StudioChatPanelRect => {
      const bounds = getChatCanvasBounds()
      const availableWidth = Math.max(240, bounds.width - CHAT_PANEL_MARGIN * 2)
      const availableHeight = Math.max(
        260,
        bounds.height - CHAT_PANEL_TOP_OFFSET - CHAT_PANEL_MARGIN
      )
      const minWidth = Math.min(MIN_CHAT_PANEL_WIDTH, availableWidth)
      const maxWidth = Math.max(minWidth, Math.min(MAX_CHAT_PANEL_WIDTH, availableWidth))
      const minHeight = Math.min(MIN_CHAT_PANEL_HEIGHT, availableHeight)
      const maxHeight = Math.max(minHeight, Math.min(MAX_CHAT_PANEL_HEIGHT, availableHeight))
      const width = clamp(nextRect.width, minWidth, maxWidth)
      const height = clamp(nextRect.height, minHeight, maxHeight)
      const maxX = Math.max(CHAT_PANEL_MARGIN, bounds.width - width - CHAT_PANEL_MARGIN)
      const maxY = Math.max(CHAT_PANEL_TOP_OFFSET, bounds.height - height - CHAT_PANEL_MARGIN)

      return {
        x: clamp(nextRect.x, CHAT_PANEL_MARGIN, maxX),
        y: clamp(nextRect.y, CHAT_PANEL_TOP_OFFSET, maxY),
        width,
        height,
      }
    },
    [getChatCanvasBounds]
  )
  const getDefaultChatPanelRect = React.useCallback((): StudioChatPanelRect => {
    const bounds = getChatCanvasBounds()
    const defaultRect: StudioChatPanelRect = {
      width: DEFAULT_CHAT_PANEL_WIDTH,
      height: DEFAULT_CHAT_PANEL_HEIGHT,
      x: bounds.width - DEFAULT_CHAT_PANEL_WIDTH - CHAT_PANEL_MARGIN,
      y: CHAT_PANEL_TOP_OFFSET,
    }
    return constrainChatPanelRect(defaultRect)
  }, [constrainChatPanelRect, getChatCanvasBounds])
  const scrollChatPanelsToLatest = React.useCallback((behavior: ScrollBehavior = "auto") => {
    ;[chatInlineScrollRef.current, chatModalScrollRef.current].forEach((element) => {
      if (!element) return
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      })
    })
  }, [])
  const selectedInputMappings = React.useMemo<InputMappingRule[]>(
    () =>
      Array.isArray(selectedConfig.inputMapping)
        ? (selectedConfig.inputMapping as InputMappingRule[])
        : [],
    [selectedConfig.inputMapping]
  )

  const webhookUrl = React.useMemo(() => {
    if (!currentFlow) return ""
    return `${window.location.origin}/api/studio/webhooks/${currentFlow.webhook.id}`
  }, [currentFlow])

  const selectedIncomingNodeIds = React.useMemo(() => {
    if (!selectedNode) return []
    return edges.filter((edge) => edge.target === selectedNode.id).map((edge) => edge.source)
  }, [edges, selectedNode])
  const selectedHasWebhookUpstream = React.useMemo(
    () =>
      !!selectedNode &&
      selectedIncomingNodeIds.some(
        (sourceId) => nodes.find((node) => node.id === sourceId)?.data?.kind === "webhook"
      ),
    [nodes, selectedIncomingNodeIds, selectedNode]
  )
  const selectedHasChatUpstream = React.useMemo(
    () =>
      !!selectedNode &&
      selectedIncomingNodeIds.some(
        (sourceId) => nodes.find((node) => node.id === sourceId)?.data?.kind === "chat"
      ),
    [nodes, selectedIncomingNodeIds, selectedNode]
  )
  const manualChatPayload = React.useMemo(
    () => ({
      message: chatInput.trim(),
      history: chatMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      conversationId: chatConversationId,
    }),
    [chatConversationId, chatInput, chatMessages]
  )

  const selectedOrchestratorToolEdges = React.useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== "orchestrator") return []
    return edges.filter((edge) => {
      if (edge.source !== selectedNode.id) return false
      const branch =
        ((edge.data as any)?.condition ||
          edge.sourceHandle ||
          "always") as string
      return String(branch).toLowerCase() === "tool"
    })
  }, [edges, selectedNode])
  const modalOrchestratorToolEdges = React.useMemo(() => {
    if (!modalNode || modalNode.data.kind !== "orchestrator") return []
    return edges.filter((edge) => {
      if (edge.source !== modalNode.id) return false
      const branch =
        ((edge.data as any)?.condition ||
          edge.sourceHandle ||
          "always") as string
      return String(branch).toLowerCase() === "tool"
    })
  }, [edges, modalNode])
  const modalAIPromptMode = React.useMemo(
    () =>
      modalNodeKind === "ai" &&
      (modalConfigObject.prompt !== undefined || modalConfigObject.promptTemplate !== undefined)
        ? "template"
        : "path",
    [modalConfigObject.prompt, modalConfigObject.promptTemplate, modalNodeKind]
  )
  const modalOrchestratorInstructionMode = React.useMemo(
    () =>
      modalNodeKind === "orchestrator" && modalConfigObject.instruction !== undefined
        ? "template"
        : "path",
    [modalConfigObject.instruction, modalNodeKind]
  )

  const runTrace = React.useMemo(() => normalizeRunTrace(runResult), [runResult])
  const runNodeResults = React.useMemo(() => getRunNodeResults(runResult), [runResult])
  const runExecutedNodeIds = React.useMemo(() => normalizeRunExecutedNodeIds(runResult), [runResult])
  const runDurationMs = React.useMemo(() => getRunDurationMs(runResult), [runResult])
  const runError = React.useMemo(() => getRunError(runResult), [runResult])
  const nodeLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const node of nodes) {
      map.set(node.id, String(node.data?.label || node.id))
    }
    return map
  }, [nodes])
  const runNodeIdsForDisplay = React.useMemo(() => {
    const ids = runExecutedNodeIds.length > 0 ? runExecutedNodeIds : Object.keys(runNodeResults)
    return [...new Set(ids)]
  }, [runExecutedNodeIds, runNodeResults])
  const selectedEdge = React.useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  )
  const selectedEdgeRunDispatch = React.useMemo(() => {
    if (!selectedEdgeId) return null
    for (let traceIndex = runTrace.length - 1; traceIndex >= 0; traceIndex -= 1) {
      const traceStep = runTrace[traceIndex]
      if (!Array.isArray(traceStep.dispatches)) continue
      for (const dispatch of traceStep.dispatches) {
        if (dispatch.edgeId === selectedEdgeId) {
          return {
            traceStep,
            dispatch,
          }
        }
      }
    }
    return null
  }, [runTrace, selectedEdgeId])

  const selectedNodeLastTrace = React.useMemo(() => {
    if (!selectedNode || runTrace.length === 0) return null
    for (let index = runTrace.length - 1; index >= 0; index -= 1) {
      if (runTrace[index].nodeId === selectedNode.id) {
        return runTrace[index]
      }
    }
    return null
  }, [runTrace, selectedNode])

  const mappingPathOptions = React.useMemo(() => {
    const paths = new Set<string>([
      "input",
      "input.data",
      "trigger",
      "trigger.body",
      "nodes",
      "item",
      "itemIndex",
      "items",
    ])

    if (manualWebhookPayload && typeof manualWebhookPayload === "object") {
      collectFieldPaths(manualWebhookPayload, "trigger.body", paths)
      if (selectedNode?.data?.kind === "webhook" || selectedHasWebhookUpstream) {
        collectFieldPaths(manualWebhookPayload, "input", paths)
      }
    }

    if (manualChatPayload.message || manualChatPayload.history.length > 0) {
      collectFieldPaths(manualChatPayload, "trigger.chat", paths)
      if (selectedNode?.data?.kind === "chat" || selectedHasChatUpstream) {
        collectFieldPaths(manualChatPayload, "input", paths)
      }
    }

    for (const sourceId of selectedIncomingNodeIds) {
      paths.add(`nodes.${sourceId}`)
      const nodeOutput = runNodeResults[sourceId]
      if (nodeOutput !== undefined) {
        collectFieldPaths(nodeOutput, `nodes.${sourceId}`, paths)
        collectFieldPaths(nodeOutput, "input", paths)
      }
    }

    if (selectedNodeLastTrace?.inputSnapshot !== undefined) {
      collectFieldPaths(selectedNodeLastTrace.inputSnapshot, "input", paths)
    }

    if (runResult?.output !== undefined) {
      collectFieldPaths(runResult.output, "output", paths)
    }

    return [...paths].sort((a, b) => a.localeCompare(b))
  }, [
    manualChatPayload,
    manualWebhookPayload,
    runNodeResults,
    runResult,
    selectedHasChatUpstream,
    selectedHasWebhookUpstream,
    selectedIncomingNodeIds,
    selectedNode,
    selectedNodeLastTrace,
  ])

  const mappingFieldCandidates = React.useMemo<MappingFieldCandidate[]>(() => {
    if (!selectedNode) return []

    const candidates: MappingFieldCandidate[] = []
    if (manualWebhookPayload && typeof manualWebhookPayload === "object") {
      flattenFieldCandidates(manualWebhookPayload, "trigger.body", "Webhook Payload", candidates)
      if (selectedNode.data.kind === "webhook" || selectedHasWebhookUpstream) {
        flattenFieldCandidates(
          manualWebhookPayload,
          "input",
          selectedNode.data.kind === "webhook" ? "Webhook Body" : "Webhook Body as Input",
          candidates
        )
      }
    }
    if (manualChatPayload.message || manualChatPayload.history.length > 0) {
      flattenFieldCandidates(manualChatPayload, "trigger.chat", "Chat Payload", candidates)
      if (selectedNode.data.kind === "chat" || selectedHasChatUpstream) {
        flattenFieldCandidates(
          manualChatPayload,
          "input",
          selectedNode.data.kind === "chat" ? "Chat Input" : "Chat Input as Input",
          candidates
        )
      }
    }
    if (selectedNodeLastTrace?.inputSnapshot !== undefined) {
      flattenFieldCandidates(
        selectedNodeLastTrace.inputSnapshot,
        "input",
        "Incoming Input",
        candidates
      )
    }

    for (const incomingNodeId of selectedIncomingNodeIds) {
      const nodeOutput = runNodeResults[incomingNodeId]
      if (nodeOutput !== undefined) {
        const incomingNode = nodes.find((node) => node.id === incomingNodeId)
        const nodeLabel = incomingNode?.data?.label || incomingNodeId
        flattenFieldCandidates(
          nodeOutput,
          `nodes.${incomingNodeId}`,
          `Node: ${nodeLabel}`,
          candidates
        )
      }
    }

    if (runResult?.output !== undefined) {
      flattenFieldCandidates(runResult.output, "output", "Final Output", candidates)
    }

    const filtered =
      mappingSearch.trim().length === 0
        ? candidates
        : candidates.filter((candidate) =>
            `${candidate.sourceLabel} ${candidate.sourcePath} ${candidate.preview}`
              .toLowerCase()
              .includes(mappingSearch.toLowerCase())
          )

    const uniqueByPath = new Map<string, MappingFieldCandidate>()
    for (const candidate of filtered) {
      if (!uniqueByPath.has(candidate.sourcePath)) {
        uniqueByPath.set(candidate.sourcePath, candidate)
      }
    }

    return [...uniqueByPath.values()].slice(0, 120)
  }, [
    manualChatPayload,
    manualWebhookPayload,
    mappingSearch,
    nodes,
    runNodeResults,
    runResult,
    selectedHasChatUpstream,
    selectedHasWebhookUpstream,
    selectedIncomingNodeIds,
    selectedNode,
    selectedNodeLastTrace,
  ])
  const modalInlineSuggestions = React.useMemo(() => {
    if (!modalSuggestionState) return []

    if (modalSuggestionState.mode === "path") {
      const query = modalSuggestionState.query.trim().toLowerCase()
      const paths =
        query.length === 0
          ? mappingPathOptions
          : mappingPathOptions.filter((path) => path.toLowerCase().includes(query))
      return paths.slice(0, 8).map((path) => ({
        kind: "path" as const,
        label: path,
        sourcePath: path,
        preview: "Use this field path",
      }))
    }

    const query = modalSuggestionState.query.trim().toLowerCase()
    const candidates =
      query.length === 0
        ? mappingFieldCandidates
        : mappingFieldCandidates.filter((candidate) =>
            `${candidate.sourcePath} ${candidate.sourceLabel} ${candidate.preview}`
              .toLowerCase()
              .includes(query)
          )
    return candidates.slice(0, 8).map((candidate) => ({
      kind: "template" as const,
      label: candidate.sourceLabel,
      sourcePath: candidate.sourcePath,
      preview: candidate.preview,
    }))
  }, [mappingFieldCandidates, mappingPathOptions, modalSuggestionState])

  const clearPlaybackTimer = React.useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
  }, [])

  const clearExecutionPlayback = React.useCallback(() => {
    clearPlaybackTimer()
    setExecutionPlaybackRunning(false)
    setExecutionPlaybackSteps([])
    setExecutionPlaybackIndex(-1)
  }, [clearPlaybackTimer])

  const replayExecutionPlayback = React.useCallback(() => {
    if (executionPlaybackSteps.length === 0) return
    clearPlaybackTimer()
    setExecutionPlaybackIndex(-1)
    setExecutionPlaybackRunning(true)
  }, [clearPlaybackTimer, executionPlaybackSteps])

  const executionVisualState = React.useMemo(() => {
    const completedNodeIds = new Set<string>()
    const completedEdgeIds = new Set<string>()
    const executionOrder = new Map<string, number>()
    const cappedIndex = Math.min(executionPlaybackIndex, executionPlaybackSteps.length - 1)
    let activeNodeId: string | null = null
    let activeEdgeIds = new Set<string>()
    let failedNodeId: string | null = null

    if (cappedIndex >= 0) {
      for (let index = 0; index <= cappedIndex; index += 1) {
        const step = executionPlaybackSteps[index]
        completedNodeIds.add(step.nodeId)
        if (!executionOrder.has(step.nodeId)) {
          executionOrder.set(step.nodeId, executionOrder.size + 1)
        }
        for (const edgeId of step.edgeIds) {
          completedEdgeIds.add(edgeId)
        }
        if (step.status === "failed") {
          failedNodeId = step.nodeId
        }
      }

      if (executionPlaybackRunning) {
        const activeStep = executionPlaybackSteps[cappedIndex]
        activeNodeId = activeStep.nodeId
        activeEdgeIds = new Set(activeStep.edgeIds)
      }
    }

    return {
      activeNodeId,
      activeEdgeIds,
      completedNodeIds,
      completedEdgeIds,
      executionOrder,
      failedNodeId,
    }
  }, [executionPlaybackIndex, executionPlaybackRunning, executionPlaybackSteps])

  const renderedNodes = React.useMemo(
    () =>
      nodes.map((node) => {
        let executionState: NodeExecutionVisualState = "idle"
        if (executionVisualState.failedNodeId === node.id) {
          executionState = "failed"
        } else if (executionVisualState.activeNodeId === node.id) {
          executionState = "active"
        } else if (executionVisualState.completedNodeIds.has(node.id)) {
          executionState = "completed"
        }

        return {
          ...node,
          data: {
            ...node.data,
            executionState,
            executionOrder: executionVisualState.executionOrder.get(node.id),
          },
        }
      }),
    [executionVisualState, nodes]
  )

  const edgePreviewById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const step of runTrace) {
      for (const dispatch of step.dispatches || []) {
        if (!dispatch.edgeId) continue
        const previewSource =
          dispatch.inputSnapshot !== undefined
            ? dispatch.inputSnapshot
            : runNodeResults[dispatch.sourceNodeId]
        map.set(dispatch.edgeId, toInlinePreview(previewSource))
      }
    }
    return map
  }, [runNodeResults, runTrace])

  const renderedEdges = React.useMemo(
    () =>
      edges.map((edge) => {
        const isActive = executionVisualState.activeEdgeIds.has(edge.id)
        const isCompleted = executionVisualState.completedEdgeIds.has(edge.id)
        const isSelectedEdge = selectedEdgeId === edge.id
        const branchLabel = String((edge.data as any)?.condition || "").toLowerCase()
        const baseLabel =
          branchLabel && branchLabel !== "always"
            ? branchLabel
            : typeof edge.label === "string" && edge.label.trim().length > 0
              ? edge.label
              : ""
        const dataPreview = edgePreviewById.get(edge.id) || ""
        const edgeLabel =
          dataPreview.length > 0
            ? `${baseLabel ? `${baseLabel} | ` : ""}${dataPreview}`
            : baseLabel || undefined
        const style = isSelectedEdge
          ? {
              stroke: "rgba(251, 191, 36, 0.95)",
              strokeWidth: 3,
            }
          : isActive
          ? {
              stroke: "rgba(34, 211, 238, 0.95)",
              strokeWidth: 3,
            }
          : isCompleted
            ? {
                stroke: "rgba(14, 165, 233, 0.9)",
                strokeWidth: 2.5,
              }
            : {
                ...DEFAULT_EDGE_STYLE,
              }

        return {
          ...edge,
          animated: isActive || isSelectedEdge,
          style,
          label: edgeLabel,
          labelStyle: {
            fill: "rgba(186, 230, 253, 0.95)",
            fontSize: 10,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          },
          labelBgStyle: {
            fill: "rgba(9, 14, 26, 0.86)",
            fillOpacity: 1,
            stroke: "rgba(56, 189, 248, 0.35)",
            strokeWidth: 1,
          },
          labelBgPadding: [6, 2] as [number, number],
          labelBgBorderRadius: 4,
        }
      }),
    [
      edgePreviewById,
      edges,
      executionVisualState.activeEdgeIds,
      executionVisualState.completedEdgeIds,
      selectedEdgeId,
    ]
  )

  const playbackProgressLabel = React.useMemo(() => {
    if (executionPlaybackSteps.length === 0) return null
    const current = Math.max(0, Math.min(executionPlaybackIndex + 1, executionPlaybackSteps.length))
    return `${current}/${executionPlaybackSteps.length}`
  }, [executionPlaybackIndex, executionPlaybackSteps.length])

  const onNodesChange: OnNodesChange<CanvasNode> = React.useCallback(
    (changes) => setNodes((prev) => applyNodeChanges(changes, prev)),
    []
  )

  const onEdgesChange: OnEdgesChange<Edge> = React.useCallback(
    (changes) => setEdges((prev) => applyEdgeChanges(changes, prev)),
    []
  )

  const onNodeContextMenu = React.useCallback(
    (event: React.MouseEvent, node: CanvasNode) => {
      event.preventDefault()
      setSelectedNodeId(node.id)

      const bounds = canvasRef.current?.getBoundingClientRect()
      const left = bounds?.left || 0
      const top = bounds?.top || 0
      const width = bounds?.width || window.innerWidth
      const height = bounds?.height || window.innerHeight
      const menuWidth = 220
      const menuHeight = 170
      const x = Math.max(10, Math.min(event.clientX - left + 8, width - menuWidth - 10))
      const y = Math.max(10, Math.min(event.clientY - top + 8, height - menuHeight - 10))

      setNodeContextMenu({
        nodeId: node.id,
        x,
        y,
      })
    },
    []
  )

  const onConnect = React.useCallback((connection: Connection) => {
    const edgeId = `edge_${connection.source}_${connection.target}_${Date.now()}`
    const condition =
      connection.sourceHandle === "true" ||
      connection.sourceHandle === "false" ||
      connection.sourceHandle === "item" ||
      connection.sourceHandle === "done" ||
      connection.sourceHandle === "tool" ||
      connection.sourceHandle === "next"
        ? connection.sourceHandle
        : "always"
    setEdges((prev) =>
      addEdge(
        {
          ...connection,
          id: edgeId,
          label: condition !== "always" ? condition : undefined,
          data: {
            condition,
          },
          style: { ...DEFAULT_EDGE_STYLE },
        },
        prev
      )
    )
  }, [])

  React.useEffect(() => {
    loadFlows()
    loadApiKeys()
  }, [])

  React.useEffect(() => {
    const onFullscreenChange = () => {
      setBrowserFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(min-width: 1280px)")
    const updateLayoutMode = () => setIsDesktopLayout(media.matches)
    updateLayoutMode()
    media.addEventListener("change", updateLayoutMode)
    return () => media.removeEventListener("change", updateLayoutMode)
  }, [])

  React.useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const activeResize = resizeStateRef.current
      if (!activeResize || focusMode || !isDesktopLayout) return

      if (activeResize.panel === "left") {
        const layoutWidth = layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth
        const nextWidth = clamp(
          activeResize.startWidth + (event.clientX - activeResize.startX),
          MIN_LEFT_PANEL_WIDTH,
          Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, layoutWidth - 360))
        )
        setLeftPanelWidth(nextWidth)
        return
      }

      const layoutHeight = layoutRef.current?.getBoundingClientRect().height ?? window.innerHeight
      const nextHeight = clamp(
        activeResize.startHeight - (event.clientY - activeResize.startY),
        MIN_OUTPUT_PANEL_HEIGHT,
        Math.min(MAX_OUTPUT_PANEL_HEIGHT, Math.max(MIN_OUTPUT_PANEL_HEIGHT, layoutHeight - 180))
      )
      setOutputPanelHeight(nextHeight)
    }

    const handlePointerUp = () => {
      resizeStateRef.current = null
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", handlePointerUp)
    return () => {
      window.removeEventListener("mousemove", handlePointerMove)
      window.removeEventListener("mouseup", handlePointerUp)
    }
  }, [focusMode, isDesktopLayout])

  React.useEffect(() => {
    const handleChatPanelMove = (event: MouseEvent) => {
      const activeGesture = chatPanelGestureRef.current
      if (!activeGesture) return

      const deltaX = event.clientX - activeGesture.startX
      const deltaY = event.clientY - activeGesture.startY

      if (activeGesture.mode === "drag") {
        setChatPanelRect(
          constrainChatPanelRect({
            ...activeGesture.startRect,
            x: activeGesture.startRect.x + deltaX,
            y: activeGesture.startRect.y + deltaY,
          })
        )
        return
      }

      setChatPanelRect(
        constrainChatPanelRect({
          ...activeGesture.startRect,
          width: activeGesture.startRect.width + deltaX,
          height: activeGesture.startRect.height + deltaY,
        })
      )
    }

    const handleChatPanelEnd = () => {
      if (!chatPanelGestureRef.current) return
      chatPanelGestureRef.current = null
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    window.addEventListener("mousemove", handleChatPanelMove)
    window.addEventListener("mouseup", handleChatPanelEnd)
    return () => {
      window.removeEventListener("mousemove", handleChatPanelMove)
      window.removeEventListener("mouseup", handleChatPanelEnd)
    }
  }, [constrainChatPanelRect])

  React.useEffect(() => {
    const syncChatPanel = () => {
      setChatPanelRect((previous) => constrainChatPanelRect(previous))
    }

    const frameId = window.requestAnimationFrame(syncChatPanel)
    window.addEventListener("resize", syncChatPanel)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("resize", syncChatPanel)
    }
  }, [
    browserFullscreen,
    constrainChatPanelRect,
    currentFlow?.id,
    focusMode,
    leftPanelCollapsed,
    outputPanelCollapsed,
  ])

  React.useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      scrollChatPanelsToLatest(chatRunning ? "auto" : "smooth")
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [
    chatMessages,
    chatModalOpen,
    chatPanelCollapsed,
    chatPanelRect.height,
    chatPanelRect.width,
    chatRunning,
    scrollChatPanelsToLatest,
  ])

  React.useEffect(() => {
    if (selectedNode) {
      setNodeConfigText(JSON.stringify(selectedNode.data.config || {}, null, 2))
      setNodeConfigError(null)
    } else {
      setNodeConfigText("{}")
      setNodeConfigError(null)
    }
  }, [selectedNode])

  React.useEffect(() => {
    if (!nodeConfigModalOpen || !modalNode) {
      setModalConfigError(null)
      setModalNodeTestError(null)
      setModalSuggestionState(null)
      return
    }
    setModalNodeLabel(String(modalNode.data?.label || ""))
    setModalConfigDraft(JSON.stringify(modalNode.data?.config || {}, null, 2))
    setModalConfigError(null)
    setModalNodeTestError(null)
    setModalSuggestionState(null)
  }, [modalNode, nodeConfigModalOpen])

  React.useEffect(() => {
    if (!nodeContextMenu) return
    const closeMenu = () => setNodeContextMenu(null)
    window.addEventListener("click", closeMenu)
    window.addEventListener("blur", closeMenu)
    return () => {
      window.removeEventListener("click", closeMenu)
      window.removeEventListener("blur", closeMenu)
    }
  }, [nodeContextMenu])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNodeContextMenu(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  React.useEffect(() => {
    if (modalNodeId && !nodes.some((node) => node.id === modalNodeId)) {
      setNodeConfigModalOpen(false)
      setModalNodeId(null)
    }
    if (nodeContextMenu && !nodes.some((node) => node.id === nodeContextMenu.nodeId)) {
      setNodeContextMenu(null)
    }
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null)
    }
  }, [edges, modalNodeId, nodeContextMenu, nodes, selectedEdgeId])

  React.useEffect(() => {
    setMappingSearch("")
  }, [selectedNodeId])

  React.useEffect(() => {
    if (!selectedNode || !isSelectedNodeAI) {
      setProviderModels([])
      setProviderModelsNodeId(null)
      return
    }
    if (providerModelsNodeId !== selectedNode.id) {
      setProviderModels([])
    }
  }, [selectedNode, isSelectedNodeAI, providerModelsNodeId])

  React.useEffect(() => {
    if (!selectedNode) {
      setNodeTestResult(null)
      return
    }

    const webhookBody =
      manualWebhookPayload && typeof manualWebhookPayload === "object" ? manualWebhookPayload : {}
    const chatPayload = manualChatPayload

    let inputPayload: any = selectedNodeLastTrace?.inputSnapshot
    if (inputPayload === undefined) {
      if (selectedNode.data.kind === "webhook") {
        inputPayload = webhookBody
      } else if (selectedNode.data.kind === "chat") {
        inputPayload = chatPayload
      } else if (selectedIncomingNodeIds.length === 1) {
        const sourceId = selectedIncomingNodeIds[0]
        const sourceNode = nodes.find((node) => node.id === sourceId)
        inputPayload =
          sourceNode?.data?.kind === "webhook"
            ? runNodeResults[sourceId]?.data ?? webhookBody
            : sourceNode?.data?.kind === "chat"
              ? runNodeResults[sourceId]?.data ?? chatPayload
              : runNodeResults[sourceId] ?? {}
      } else if (selectedIncomingNodeIds.length > 1) {
        inputPayload = selectedIncomingNodeIds.reduce((acc: Record<string, any>, sourceId) => {
          const sourceNode = nodes.find((node) => node.id === sourceId)
          acc[sourceId] =
            sourceNode?.data?.kind === "webhook"
              ? runNodeResults[sourceId]?.data ?? webhookBody
              : sourceNode?.data?.kind === "chat"
                ? runNodeResults[sourceId]?.data ?? chatPayload
                : runNodeResults[sourceId] ?? {}
          return acc
        }, {})
      } else {
        inputPayload = {}
      }
    }

    if (selectedNode.data.kind === "webhook") {
      setNodeTestInput(JSON.stringify(webhookBody, null, 2))
    } else if (selectedNode.data.kind === "chat") {
      setNodeTestInput(JSON.stringify(chatPayload, null, 2))
    } else {
      setNodeTestInput(
        JSON.stringify(
          {
            trigger: {
              body: webhookBody,
              chat: chatPayload,
              ...(user
                ? {
                    user: {
                      user_id: user.id,
                      tenant_id: user.tenant_id,
                      email: user.email,
                    },
                  }
                : {}),
            },
            input: inputPayload,
            nodes: runNodeResults,
          },
          null,
          2
        )
      )
    }
    setNodeTestResult(null)
  }, [
    manualChatPayload,
    manualWebhookPayload,
    nodes,
    runNodeResults,
    selectedIncomingNodeIds,
    selectedNode,
    selectedNodeLastTrace,
    user,
  ])

  React.useEffect(() => {
    if (!executionPlaybackRunning) return
    if (executionPlaybackSteps.length === 0) {
      setExecutionPlaybackRunning(false)
      return
    }
    if (executionPlaybackIndex >= executionPlaybackSteps.length - 1) {
      setExecutionPlaybackRunning(false)
      return
    }

    const nextStep = executionPlaybackSteps[executionPlaybackIndex + 1]
    const delayMs = Math.max(
      240,
      Math.min(1200, Number(nextStep.durationMs || 0) + 140 || 480)
    )
    playbackTimerRef.current = window.setTimeout(() => {
      setExecutionPlaybackIndex((previous) =>
        Math.min(previous + 1, executionPlaybackSteps.length - 1)
      )
    }, delayMs)

    return () => {
      clearPlaybackTimer()
    }
  }, [
    clearPlaybackTimer,
    executionPlaybackIndex,
    executionPlaybackRunning,
    executionPlaybackSteps,
  ])

  React.useEffect(
    () => () => {
      clearPlaybackTimer()
      clearModalSuggestionDismissTimer()
    },
    [clearPlaybackTimer]
  )

  const resetCurrentFlowState = React.useCallback(() => {
    setCurrentFlow(null)
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setNodeContextMenu(null)
    setNodeConfigModalOpen(false)
    setModalNodeId(null)
    setRuns([])
    setHistory([])
    setCodegen(null)
    setSelectedRunId(null)
    setRunResult(null)
    setNodeTestResult(null)
    setChatMessages([])
    setChatInput(DEFAULT_CHAT_MESSAGE_INPUT)
    setChatConversationId(`studio_chat_${Date.now()}`)
    setChatPanelCollapsed(false)
    setChatModalOpen(false)
    setChatPanelRect(getDefaultChatPanelRect())
    clearExecutionPlayback()
  }, [clearExecutionPlayback, getDefaultChatPanelRect])

  const loadFlows = async () => {
    try {
      setLoading(true)
      const response = await studioAPI.getFlows()
      const list = (response.data.data || []) as StudioFlow[]
      setFlows(list)

      if (list.length > 0) {
        const activeId = currentFlow?.id || list[0].id
        await loadFlow(activeId, list)
      } else {
        resetCurrentFlowState()
      }
    } catch (err: any) {
      setError(err.message || "Failed to load flows")
    } finally {
      setLoading(false)
    }
  }

  const loadApiKeys = async () => {
    try {
      const response = await userAPI.getApiKeys()
      setApiKeys((response.data.data || []) as ApiKey[])
    } catch (_err) {
      setApiKeys([])
    }
  }

  const loadFlow = async (flowId: string, sourceList?: StudioFlow[]) => {
    try {
      const localFlow = (sourceList || flows).find((flow) => flow.id === flowId)
      let flow = localFlow || null
      if (!flow) {
        const response = await studioAPI.getFlow(flowId)
        flow = response.data.data as StudioFlow
      }

      if (!flow) return
      setCurrentFlow(flow)
      setNodes(toCanvasNodes(flow))
      setEdges(toCanvasEdges(flow))
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setNodeContextMenu(null)
      setNodeConfigModalOpen(false)
      setModalNodeId(null)
      setCodegen(null)
      setSelectedRunId(null)
      setRunResult(null)
      setRunInput(getDefaultRunInputForFlow(flow))
      setNodeTestInput(getDefaultRunInputForFlow(flow))
      setNodeTestResult(null)
      setChatMessages([])
      setChatInput(
        String(
          flow.nodes.find((node) => node.type === "chat")?.config?.defaultPrompt ||
            DEFAULT_CHAT_MESSAGE_INPUT
        )
      )
      setChatConversationId(`studio_chat_${Date.now()}`)
      setChatPanelCollapsed(false)
      setChatModalOpen(false)
      setChatPanelRect(getDefaultChatPanelRect())
      clearExecutionPlayback()
      await loadRuns(flow.id)
      await loadHistory(flow.id)
    } catch (err: any) {
      setError(err.message || "Failed to load selected flow")
    }
  }

  const loadRuns = async (flowId: string) => {
    try {
      const response = await studioAPI.getRuns(flowId, 10)
      setRuns((response.data.data || []) as StudioRun[])
    } catch (_err) {
      setRuns([])
    }
  }

  const loadHistory = async (flowId: string) => {
    try {
      const response = await studioAPI.getFlowHistory(flowId, 30)
      setHistory((response.data.data || []) as StudioFlowHistory[])
    } catch (_err) {
      setHistory([])
    }
  }

  const createBlankFlow = async () => {
    try {
      const response = await studioAPI.createFlow({
        name: `Studio Flow ${flows.length + 1}`,
        description: "New no-code flow",
        status: "draft",
      })
      const flow = response.data.data as StudioFlow
      setFlows((prev) => [flow, ...prev])
      await loadFlow(flow.id, [flow, ...flows])
    } catch (err: any) {
      setError(err.message || "Failed to create flow")
    }
  }

  const createSampleFlow = async (
    templateId: "simple_url" | "simple_body" | "loop_users" | "ai_basic" | "ai_orchestrator" = "loop_users"
  ) => {
    try {
      const response = await studioAPI.createSampleFlow(templateId)
      const flow = response.data.data as StudioFlow
      setFlows((prev) => [flow, ...prev])
      await loadFlow(flow.id, [flow, ...flows])
    } catch (err: any) {
      setError(err.message || "Failed to create sample flow")
    }
  }

  const deleteFlowById = async (flowId: string) => {
    const targetFlow = flows.find((flow) => flow.id === flowId)
    if (!targetFlow) return

    const confirmed = window.confirm(`Delete "${targetFlow.name}"? This will also remove its run history.`)
    if (!confirmed) return

    try {
      setDeletingFlowId(flowId)
      setError(null)
      await studioAPI.deleteFlow(flowId)

      const remainingFlows = flows.filter((flow) => flow.id !== flowId)
      setFlows(remainingFlows)

      if (currentFlow?.id === flowId) {
        if (remainingFlows.length > 0) {
          await loadFlow(remainingFlows[0].id, remainingFlows)
        } else {
          resetCurrentFlowState()
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete flow")
    } finally {
      setDeletingFlowId(null)
    }
  }

  const saveFlow = async (
    overrides?: { nodes?: CanvasNode[]; edges?: Edge[] },
    options?: { suppressPageError?: boolean; onError?: (message: string) => void }
  ): Promise<boolean> => {
    if (!currentFlow) return false
    try {
      setSaving(true)
      setError(null)
      const payload = {
        name: currentFlow.name,
        description: currentFlow.description,
        status: currentFlow.status,
        webhook: currentFlow.webhook,
        nodes: toFlowNodes(overrides?.nodes || nodes),
        edges: toFlowEdges(overrides?.edges || edges),
      }

      const response = await studioAPI.updateFlow(currentFlow.id, payload)
      const saved = response.data.data as StudioFlow
      setCurrentFlow(saved)
      setFlows((prev) => prev.map((flow) => (flow.id === saved.id ? saved : flow)))
      await loadHistory(saved.id)
      return true
    } catch (err: any) {
      const message = err.message || "Failed to save flow"
      options?.onError?.(message)
      if (!options?.suppressPageError) {
        setError(message)
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const restoreHistoryVersion = async (historyId: string) => {
    if (!currentFlow) return
    try {
      setRestoringHistoryId(historyId)
      setError(null)
      const response = await studioAPI.restoreFlowHistory(currentFlow.id, historyId)
      const restored = response.data.data as StudioFlow
      setCurrentFlow(restored)
      setNodes(toCanvasNodes(restored))
      setEdges(toCanvasEdges(restored))
      setFlows((prev) => prev.map((flow) => (flow.id === restored.id ? restored : flow)))
      await loadHistory(restored.id)
    } catch (err: any) {
      setError(err.message || "Failed to restore historical flow")
    } finally {
      setRestoringHistoryId(null)
    }
  }

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (_error) {
      setError("Fullscreen is not available in this browser context")
    }
  }

  const startLeftPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (focusMode || !isDesktopLayout || leftPanelCollapsed) return
    event.preventDefault()
    resizeStateRef.current = {
      panel: "left",
      startX: event.clientX,
      startY: event.clientY,
      startWidth: leftPanelWidth,
      startHeight: outputPanelHeight,
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
  }

  const startOutputPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (focusMode || !isDesktopLayout || outputPanelCollapsed) return
    event.preventDefault()
    resizeStateRef.current = {
      panel: "output",
      startX: event.clientX,
      startY: event.clientY,
      startWidth: leftPanelWidth,
      startHeight: outputPanelHeight,
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "row-resize"
  }

  const startChatPanelDrag = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    chatPanelGestureRef.current = {
      mode: "drag",
      startX: event.clientX,
      startY: event.clientY,
      startRect: chatPanelRect,
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "move"
  }

  const startChatPanelResize = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    chatPanelGestureRef.current = {
      mode: "resize",
      startX: event.clientX,
      startY: event.clientY,
      startRect: chatPanelRect,
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "nwse-resize"
  }

  const resetChatPanelLayout = React.useCallback(() => {
    setChatPanelCollapsed(false)
    setChatPanelRect(getDefaultChatPanelRect())
  }, [getDefaultChatPanelRect])

  const resetStudioLayout = React.useCallback(() => {
    setLeftPanelWidth(DEFAULT_LEFT_PANEL_WIDTH)
    setLeftPanelCollapsed(false)
    setOutputPanelHeight(DEFAULT_OUTPUT_PANEL_HEIGHT)
    setOutputPanelCollapsed(false)
    resetChatPanelLayout()
  }, [resetChatPanelLayout])

  const expandStudioEditor = React.useCallback(() => {
    setLeftPanelCollapsed(true)
    setOutputPanelCollapsed(true)
  }, [])

  const toggleOutputPanel = React.useCallback(() => {
    setOutputPanelCollapsed((prev) => !prev)
  }, [])

  const toggleLeftPanel = React.useCallback(() => {
    setLeftPanelCollapsed((prev) => !prev)
  }, [])

  const toggleExpandedOutputPanel = React.useCallback(() => {
    const layoutHeight = layoutRef.current?.getBoundingClientRect().height ?? window.innerHeight
    const expandedHeight = clamp(
      Math.round(layoutHeight * 0.58),
      MIN_OUTPUT_PANEL_HEIGHT,
      Math.min(MAX_OUTPUT_PANEL_HEIGHT, Math.max(MIN_OUTPUT_PANEL_HEIGHT, layoutHeight - 180))
    )
    setOutputPanelCollapsed(false)
    setOutputPanelHeight((prev) =>
      prev >= DEFAULT_OUTPUT_PANEL_HEIGHT + 120 ? DEFAULT_OUTPUT_PANEL_HEIGHT : expandedHeight
    )
  }, [])

  const addNode = (type: StudioNodeType) => {
    const id = `node_${type}_${Date.now()}`
    const nextNode: CanvasNode = {
      id,
      type: "studioNode",
      position: {
        x: 220 + Math.random() * 280,
        y: 120 + Math.random() * 260,
      },
      data: {
        label: DEFAULT_NODE_NAME[type],
        kind: type,
        config: JSON.parse(JSON.stringify(DEFAULT_NODE_CONFIG[type] || {})),
      },
    }

    setNodes((prev) => [...prev, nextNode])
    setSelectedNodeId(id)
  }

  const updateSelectedNodeLabel = (label: string) => {
    if (!selectedNode) return
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                label,
              },
            }
          : node
      )
    )
  }

  const applyNodeConfig = () => {
    if (!selectedNode) return
    try {
      const parsed = nodeConfigText.trim() ? JSON.parse(nodeConfigText) : {}
      setNodes((prev) =>
        prev.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: parsed,
                },
              }
            : node
        )
      )
      setNodeConfigError(null)
    } catch (err: any) {
      setNodeConfigError(err.message || "Invalid JSON config")
    }
  }

  const updateSelectedNodeConfig = (patch: Record<string, any>) => {
    if (!selectedNode) return
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...(node.data.config || {}),
                  ...patch,
                },
              },
            }
          : node
      )
    )
  }

  const setSelectedNodeConfigValue = (key: string, value: any) => {
    updateSelectedNodeConfig({ [key]: value })
  }

  const setSelectedInputMappings = (mappings: InputMappingRule[]) => {
    setSelectedNodeConfigValue("inputMapping", mappings)
  }

  const addInputMappingRow = () => {
    const nextMappings = [
      ...selectedInputMappings,
      {
        sourcePath: "",
        targetField: "",
        required: false,
      },
    ]
    setSelectedInputMappings(nextMappings)
  }

  const updateInputMappingRow = (index: number, patch: Partial<InputMappingRule>) => {
    const nextMappings = selectedInputMappings.map((mapping, mappingIndex) =>
      mappingIndex === index ? { ...mapping, ...patch } : mapping
    )
    setSelectedInputMappings(nextMappings)
  }

  const removeInputMappingRow = (index: number) => {
    const nextMappings = selectedInputMappings.filter((_, mappingIndex) => mappingIndex !== index)
    setSelectedInputMappings(nextMappings)
  }

  const addInputMappingFromSourcePath = (sourcePath: string) => {
    const normalized = String(sourcePath || "").trim()
    if (!normalized) return

    const exists = selectedInputMappings.some(
      (mapping) => String(mapping.sourcePath || "").trim() === normalized
    )
    if (exists) return

    const nextMappings = [
      ...selectedInputMappings,
      {
        sourcePath: normalized,
        targetField: getTargetFieldSuggestion(normalized),
        required: false,
      },
    ]
    setSelectedInputMappings(nextMappings)
  }

  const autoMapFromLatestInput = () => {
    if (!selectedNodeLastTrace || typeof selectedNodeLastTrace.inputSnapshot !== "object") return
    const source = selectedNodeLastTrace.inputSnapshot
    if (!source || Array.isArray(source) || typeof source !== "object") return
    const keys = Object.keys(source).slice(0, 20)
    if (keys.length === 0) return

    const nextMappings = [...selectedInputMappings]
    for (const key of keys) {
      const sourcePath = `input.${key}`
      const exists = nextMappings.some(
        (mapping) => String(mapping.sourcePath || "").trim() === sourcePath
      )
      if (!exists) {
        nextMappings.push({
          sourcePath,
          targetField: key,
          required: false,
        })
      }
    }
    setSelectedInputMappings(nextMappings)
  }

  const clearInputMappings = () => {
    setSelectedInputMappings([])
  }

  const deleteNodeById = (nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId))
    setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev))
    setNodeContextMenu((prev) => (prev?.nodeId === nodeId ? null : prev))
    if (modalNodeId === nodeId) {
      setNodeConfigModalOpen(false)
      setModalNodeId(null)
    }
  }

  const duplicateNodeById = (nodeId: string) => {
    const sourceNode = nodes.find((node) => node.id === nodeId)
    if (!sourceNode) return

    const duplicateId = `node_${sourceNode.data.kind}_${Date.now()}`
    const duplicatedNode: CanvasNode = {
      ...sourceNode,
      id: duplicateId,
      position: {
        x: (sourceNode.position?.x || 120) + 60,
        y: (sourceNode.position?.y || 120) + 40,
      },
      data: {
        ...sourceNode.data,
        label: `${sourceNode.data.label} Copy`,
        config: JSON.parse(JSON.stringify(sourceNode.data.config || {})),
      },
    }
    setNodes((prev) => [...prev, duplicatedNode])
    setSelectedNodeId(duplicateId)
  }

  const openNodeConfigModal = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setModalNodeId(nodeId)
    setNodeContextMenu(null)
    setNodeConfigModalOpen(true)
  }

  const setModalConfigFields = (patch: Record<string, any>) => {
    setModalConfigDraft((previousDraft) => {
      let parsed: Record<string, any> = {}
      try {
        parsed = previousDraft.trim() ? JSON.parse(previousDraft) : {}
      } catch {
        parsed = {}
      }
      for (const [key, value] of Object.entries(patch)) {
        parsed[key] = value
      }
      return JSON.stringify(parsed, null, 2)
    })
    setModalConfigError(null)
  }

  const setModalConfigField = (key: string, value: any) => {
    setModalConfigFields({ [key]: value })
  }

  const setModalInputMappings = (mappings: InputMappingRule[]) => {
    setModalConfigField("inputMapping", mappings)
  }

  const addModalInputMappingRow = () => {
    const nextMappings = [
      ...modalInputMappings,
      {
        sourcePath: "",
        targetField: "",
        required: false,
      },
    ]
    setModalInputMappings(nextMappings)
  }

  const updateModalInputMappingRow = (index: number, patch: Partial<InputMappingRule>) => {
    const nextMappings = modalInputMappings.map((mapping, mappingIndex) =>
      mappingIndex === index ? { ...mapping, ...patch } : mapping
    )
    setModalInputMappings(nextMappings)
  }

  const removeModalInputMappingRow = (index: number) => {
    const nextMappings = modalInputMappings.filter((_, mappingIndex) => mappingIndex !== index)
    setModalInputMappings(nextMappings)
  }

  const addModalInputMappingFromSourcePath = (sourcePath: string) => {
    const normalized = String(sourcePath || "").trim()
    if (!normalized) return

    const exists = modalInputMappings.some(
      (mapping) => String(mapping.sourcePath || "").trim() === normalized
    )
    if (exists) return

    const nextMappings = [
      ...modalInputMappings,
      {
        sourcePath: normalized,
        targetField: getTargetFieldSuggestion(normalized),
        required: false,
      },
    ]
    setModalInputMappings(nextMappings)
  }

  const autoMapModalFromLatestInput = () => {
    const source =
      selectedNodeLastTrace?.inputSnapshot !== undefined
        ? selectedNodeLastTrace.inputSnapshot
        : modalNode?.data?.kind === "webhook" || selectedHasWebhookUpstream
          ? manualWebhookPayload
          : modalNode?.data?.kind === "chat" || selectedHasChatUpstream
            ? manualChatPayload
          : undefined
    if (!source || Array.isArray(source) || typeof source !== "object") return
    const keys = Object.keys(source).slice(0, 20)
    if (keys.length === 0) return

    const nextMappings = [...modalInputMappings]
    for (const key of keys) {
      const sourcePath = `input.${key}`
      const exists = nextMappings.some(
        (mapping) => String(mapping.sourcePath || "").trim() === sourcePath
      )
      if (!exists) {
        nextMappings.push({
          sourcePath,
          targetField: key,
          required: false,
        })
      }
    }
    setModalInputMappings(nextMappings)
  }

  const clearModalInputMappings = () => {
    setModalInputMappings([])
  }

  const buildModalNodeState = () => {
    if (!modalNode) return null
    const parsedConfig = modalConfigDraft.trim() ? JSON.parse(modalConfigDraft) : {}
    const label = modalNodeLabel.trim() || modalNode.data.label
    const nextNodes = nodes.map((node) =>
      node.id === modalNode.id
        ? {
            ...node,
            data: {
              ...node.data,
              label,
              config: parsedConfig,
            },
          }
        : node
    )

    return {
      label,
      nextNodes,
      parsedConfig,
    }
  }

  const commitModalNodeConfig = () => {
    try {
      const nextState = buildModalNodeState()
      if (!nextState) return null
      setNodes(nextState.nextNodes)
      setNodeConfigError(null)
      setNodeConfigText(JSON.stringify(nextState.parsedConfig, null, 2))
      setModalConfigError(null)
      return nextState
    } catch (error: any) {
      setModalConfigError(error.message || "Invalid JSON config")
      return null
    }
  }

  const applyModalNodeConfig = () => {
    commitModalNodeConfig()
  }

  const deleteSelectedNode = () => {
    if (!selectedNode) return
    deleteNodeById(selectedNode.id)
  }

  const revealApiKeyForSelectedMemoryNode = async (apiKeyId: string) => {
    if (!selectedNode || selectedNode.data.kind !== "memory" || !apiKeyId) return
    try {
      const response = await userAPI.regenerateApiKey(apiKeyId)
      const fullKey = response.data?.data?.apiKey
      if (fullKey) {
        updateSelectedNodeConfig({
          apiKeyId,
          apiKey: fullKey,
        })
      }
      await loadApiKeys()
    } catch (_error) {
      setError("Failed to regenerate API key for memory node")
    }
  }

  const parseHeadersText = (text: string): Record<string, string> => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const headers: Record<string, string> = {}
    for (const line of lines) {
      const idx = line.indexOf(":")
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (key) headers[key] = value
    }
    return headers
  }

  const headersToText = (headers: Record<string, any> | undefined): string => {
    if (!headers || typeof headers !== "object") return ""
    return Object.entries(headers)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n")
  }

  const normalizeNodeTestPayload = React.useCallback(
    (nodeKind: StudioNodeType | "", rawText: string) => {
      const trimmed = rawText.trim()
      const parsed = parseJsonText(rawText)
      const webhookBody =
        manualWebhookPayload && typeof manualWebhookPayload === "object" ? manualWebhookPayload : {}
      const chatPayload = manualChatPayload
      const currentTriggerUser = user
        ? {
            user_id: user.id,
            tenant_id: user.tenant_id,
            email: user.email,
          }
        : undefined

      if (trimmed && parsed === null) {
        throw new Error("Node test input must be valid JSON")
      }

      if (nodeKind === "webhook") {
        const body = parsed ?? {}
        return {
          trigger: {
            body,
            ...(currentTriggerUser ? { user: currentTriggerUser } : {}),
          },
          input: body,
          nodes: {},
        }
      }

      if (nodeKind === "chat") {
        const chatInputPayload = parsed ?? {}
        return {
          trigger: {
            body: webhookBody,
            chat: chatInputPayload,
            ...(currentTriggerUser ? { user: currentTriggerUser } : {}),
          },
          input: chatInputPayload,
          nodes: {},
        }
      }

      const payload = parsed ?? {}
      if (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        ("trigger" in payload || "input" in payload || "nodes" in payload)
      ) {
        const existingTrigger = (payload as Record<string, any>).trigger
        return {
          trigger:
            existingTrigger && typeof existingTrigger === "object"
              ? {
                  ...existingTrigger,
                  ...(existingTrigger.user ? {} : currentTriggerUser ? { user: currentTriggerUser } : {}),
                }
              : {
                  body: webhookBody,
                  chat: chatPayload,
                  ...(currentTriggerUser ? { user: currentTriggerUser } : {}),
                },
          input: (payload as Record<string, any>).input,
          nodes: (payload as Record<string, any>).nodes ?? runNodeResults,
        }
      }

      return {
        trigger: {
          body: webhookBody,
          chat: chatPayload,
          ...(currentTriggerUser ? { user: currentTriggerUser } : {}),
        },
        input: payload,
        nodes: runNodeResults,
      }
    },
    [manualChatPayload, manualWebhookPayload, runNodeResults, user]
  )

  const setModalHttpBodyText = (bodyText: string) => {
    const trimmed = bodyText.trim()
    if (!trimmed) {
      setModalConfigField("body", undefined)
      return
    }

    const parsed = parseJsonText(bodyText)
    setModalConfigField("body", parsed === null ? bodyText : parsed)
  }

  const setModalStructuredFieldText = (fieldKey: string, nextText: string) => {
    const trimmed = nextText.trim()
    if (!trimmed) {
      setModalConfigField(fieldKey, undefined)
      return
    }

    const parsed = parseJsonText(nextText)
    setModalConfigField(fieldKey, parsed === null ? nextText : parsed)
  }

  const focusModalField = (
    ref:
      | React.RefObject<HTMLInputElement | null>
      | React.RefObject<HTMLTextAreaElement | null>
      | null
      | undefined
  ) => {
    window.setTimeout(() => ref?.current?.focus(), 0)
  }

  const setModalPathFieldFromSource = (fieldKey: string, sourcePath: string) => {
    const normalized = String(sourcePath || "").trim()
    if (!normalized) return
    setModalConfigField(fieldKey, normalized)
  }

  const clearModalSuggestionDismissTimer = () => {
    if (modalSuggestionDismissTimerRef.current !== null) {
      window.clearTimeout(modalSuggestionDismissTimerRef.current)
      modalSuggestionDismissTimerRef.current = null
    }
  }

  const scheduleModalSuggestionClose = () => {
    clearModalSuggestionDismissTimer()
    modalSuggestionDismissTimerRef.current = window.setTimeout(() => {
      setModalSuggestionState(null)
    }, 120)
  }

  const showTemplateSuggestions = (
    fieldId: string,
    currentValue: string,
    selectionStart?: number | null
  ) => {
    clearModalSuggestionDismissTimer()
    const cursor = selectionStart ?? currentValue.length
    const beforeCursor = currentValue.slice(0, cursor)
    const openIndex = beforeCursor.lastIndexOf("{{")
    const closedIndex = beforeCursor.lastIndexOf("}}")
    if (openIndex >= 0 && closedIndex < openIndex) {
      const query = beforeCursor.slice(openIndex + 2).trim()
      setModalSuggestionState({
        fieldId,
        mode: "template",
        query,
      })
      return
    }
    setModalSuggestionState((previous) => (previous?.fieldId === fieldId ? null : previous))
  }

  const showPathSuggestions = (fieldId: string, currentValue: string) => {
    clearModalSuggestionDismissTimer()
    setModalSuggestionState({
      fieldId,
      mode: "path",
      query: currentValue.trim(),
    })
  }

  const insertTemplateIntoModalStringField = (
    fieldKey: string,
    currentValue: any,
    sourcePath: string,
    ref?:
      | React.RefObject<HTMLInputElement | null>
      | React.RefObject<HTMLTextAreaElement | null>,
    options?: {
      structured?: boolean
    }
  ) => {
    const token = toTemplateToken(sourcePath)
    if (!token) return
    const currentText = typeof currentValue === "string" ? currentValue : stringifyEditorValue(currentValue)
    const nextValue = insertTextAtCursor(
      currentText,
      token,
      ref?.current?.selectionStart,
      ref?.current?.selectionEnd
    )
    if (options?.structured) {
      setModalStructuredFieldText(fieldKey, nextValue)
    } else {
      setModalConfigField(fieldKey, nextValue)
    }
    focusModalField(ref)
  }

  const applyTemplateSuggestionToModalField = (
    fieldKey: string,
    currentValue: any,
    sourcePath: string,
    ref?:
      | React.RefObject<HTMLInputElement | null>
      | React.RefObject<HTMLTextAreaElement | null>,
    options?: {
      structured?: boolean
      httpBody?: boolean
    }
  ) => {
    const currentText = typeof currentValue === "string" ? currentValue : stringifyEditorValue(currentValue)
    const nextValue = replaceOpenTemplateAtCursor(
      currentText,
      sourcePath,
      ref?.current?.selectionStart
    )
    if (options?.httpBody) {
      setModalHttpBodyText(nextValue)
    } else if (options?.structured) {
      setModalStructuredFieldText(fieldKey, nextValue)
    } else {
      setModalConfigField(fieldKey, nextValue)
    }
    focusModalField(ref)
  }

  const insertTemplateIntoModalHttpField = (field: "url" | "body", sourcePath: string) => {
    const token = toTemplateToken(sourcePath)
    if (!token) return

    if (field === "url") {
      const currentValue = String(modalConfigObject.url || "")
      const nextValue = insertTextAtCursor(
        currentValue,
        token,
        modalHttpUrlInputRef.current?.selectionStart,
        modalHttpUrlInputRef.current?.selectionEnd
      )
      setModalConfigField("url", nextValue)
      window.setTimeout(() => modalHttpUrlInputRef.current?.focus(), 0)
      return
    }

    const currentValue = stringifyEditorValue(modalConfigObject.body)
    const nextValue = insertTextAtCursor(
      currentValue,
      token,
      modalHttpBodyTextareaRef.current?.selectionStart,
      modalHttpBodyTextareaRef.current?.selectionEnd
    )
    setModalHttpBodyText(nextValue)
    focusModalField(modalHttpBodyTextareaRef)
  }

  const switchModalAIPromptMode = (mode: "path" | "template") => {
    if (mode === "template") {
      setModalConfigFields({
        promptTemplate: String(modalConfigObject.promptTemplate || modalConfigObject.prompt || ""),
        prompt: undefined,
      })
      return
    }
    setModalConfigFields({
      promptTemplate: undefined,
      prompt: undefined,
      inputPath: String(modalConfigObject.inputPath || "").trim() || "input",
    })
  }

  const switchModalOrchestratorInstructionMode = (mode: "path" | "template") => {
    if (mode === "template") {
      setModalConfigFields({
        instruction: String(modalConfigObject.instruction || ""),
      })
      return
    }
    setModalConfigFields({
      instruction: undefined,
      instructionPath:
        String(modalConfigObject.instructionPath || modalConfigObject.inputPath || "").trim() || "input",
    })
  }

  const switchModalCredentialSource = (source: "paddie_system" | "byok") => {
    setProviderModels([])
    setProviderModelsNodeId(null)
    if (source === "paddie_system") {
      setModalConfigFields({
        credentialSource: "paddie_system",
        provider: "azure_openai",
        deployment:
          String(modalConfigObject.deployment || modalConfigObject.model || "").trim() || "gpt-4.1",
      })
      return
    }

    setModalConfigFields({
      credentialSource: "byok",
      provider: modalNodeProvider || "azure_openai",
    })
  }

  const switchModalAIProvider = (provider: "azure_openai" | "openai" | "groq") => {
    const patch: Record<string, any> = {
      provider,
    }

    if (provider === "azure_openai") {
      patch.deployment =
        String(modalConfigObject.deployment || modalConfigObject.model || "").trim() || "gpt-4.1"
    } else if (!String(modalConfigObject.model || "").trim()) {
      patch.model = String(modalConfigObject.model || modalConfigObject.deployment || "").trim()
    }

    setProviderModels([])
    setProviderModelsNodeId(null)
    setModalConfigFields(patch)
  }

  const loadModelsForModalNode = async () => {
    if (!modalNode || (modalNodeKind !== "ai" && modalNodeKind !== "orchestrator")) return
    try {
      setLoadingProviderModels(true)
      setModalNodeTestError(null)
      if (modalCredentialSource === "paddie_system") {
        setProviderModels(["gpt-4.1"])
        setProviderModelsNodeId(modalNode.id)
        if (!String(modalConfigObject.deployment || "").trim()) {
          setModalConfigField("deployment", "gpt-4.1")
        }
        return
      }
      const response = await studioAPI.listProviderModels({
        provider: effectiveModalAIProvider as "openai" | "azure_openai" | "groq",
        apiKey: modalConfigObject.apiKey || undefined,
        endpoint: modalConfigObject.endpoint || undefined,
        apiVersion: modalConfigObject.apiVersion || undefined,
        deployment: modalConfigObject.deployment || undefined,
      })
      const models = Array.isArray(response.data?.data) ? response.data.data : []
      const modelIds = models
        .map((item: any) => String(item?.id || "").trim())
        .filter((item: string) => item.length > 0)
      setProviderModels(modelIds)
      setProviderModelsNodeId(modalNode.id)

      const currentModel = String(modalConfigObject.model || modalConfigObject.deployment || "").trim()
      if (!currentModel && modelIds.length > 0) {
        setModalConfigField(
          effectiveModalAIProvider === "azure_openai" ? "deployment" : "model",
          modelIds[0]
        )
      }
    } catch (err: any) {
      setModalNodeTestError(err.message || "Failed to load provider models")
    } finally {
      setLoadingProviderModels(false)
    }
  }

  const applyFieldCandidateToModalNode = (
    sourcePath: string,
    target:
      | "mapping"
      | "chat_message_path"
      | "chat_history_path"
      | "http_url"
      | "http_body"
      | "memory_user_id"
      | "memory_query"
      | "memory_content"
      | "memory_context"
      | "websocket_url"
      | "websocket_message"
      | "condition_left_path"
      | "condition_right_value"
      | "loop_list_path"
      | "ai_input_path"
      | "ai_history_path"
      | "ai_prompt"
      | "orchestrator_instruction_path"
      | "orchestrator_history_path"
      | "orchestrator_instruction"
      | "output_template"
  ) => {
    switch (target) {
      case "mapping":
        addModalInputMappingFromSourcePath(sourcePath)
        return
      case "chat_message_path":
        setModalPathFieldFromSource("messagePath", sourcePath)
        focusModalField(modalChatMessagePathInputRef)
        return
      case "chat_history_path":
        setModalPathFieldFromSource("historyPath", sourcePath)
        focusModalField(modalChatHistoryPathInputRef)
        return
      case "http_url":
        insertTemplateIntoModalHttpField("url", sourcePath)
        return
      case "http_body":
        insertTemplateIntoModalHttpField("body", sourcePath)
        return
      case "memory_user_id":
        insertTemplateIntoModalStringField(
          "userId",
          modalConfigObject.userId,
          sourcePath,
          modalMemoryUserIdInputRef
        )
        return
      case "memory_query":
        insertTemplateIntoModalStringField(
          "query",
          modalConfigObject.query,
          sourcePath,
          modalMemoryQueryTextareaRef
        )
        return
      case "memory_content":
        insertTemplateIntoModalStringField(
          "content",
          modalConfigObject.content,
          sourcePath,
          modalMemoryContentTextareaRef
        )
        return
      case "memory_context":
        insertTemplateIntoModalStringField(
          "context",
          modalConfigObject.context,
          sourcePath,
          modalMemoryContextTextareaRef
        )
        return
      case "websocket_url":
        insertTemplateIntoModalStringField(
          "url",
          modalConfigObject.url,
          sourcePath,
          modalWebsocketUrlInputRef
        )
        return
      case "websocket_message":
        insertTemplateIntoModalStringField(
          "message",
          modalConfigObject.message,
          sourcePath,
          modalWebsocketMessageTextareaRef
        )
        return
      case "condition_left_path":
        setModalPathFieldFromSource("leftPath", sourcePath)
        focusModalField(modalConditionLeftPathInputRef)
        return
      case "condition_right_value":
        insertTemplateIntoModalStringField(
          "rightValue",
          modalConfigObject.rightValue,
          sourcePath,
          modalConditionRightValueInputRef
        )
        return
      case "loop_list_path":
        setModalPathFieldFromSource("listPath", sourcePath)
        focusModalField(modalLoopListPathInputRef)
        return
      case "ai_input_path":
        switchModalAIPromptMode("path")
        setModalPathFieldFromSource("inputPath", sourcePath)
        focusModalField(modalAIInputPathInputRef)
        return
      case "ai_history_path":
        setModalPathFieldFromSource("historyPath", sourcePath)
        focusModalField(modalAIHistoryPathInputRef)
        return
      case "ai_prompt":
        switchModalAIPromptMode("template")
        insertTemplateIntoModalStringField(
          "promptTemplate",
          modalConfigObject.promptTemplate || modalConfigObject.prompt,
          sourcePath,
          modalAIPromptTextareaRef
        )
        return
      case "orchestrator_instruction_path":
        switchModalOrchestratorInstructionMode("path")
        setModalPathFieldFromSource("instructionPath", sourcePath)
        focusModalField(modalOrchestratorInstructionPathInputRef)
        return
      case "orchestrator_history_path":
        setModalPathFieldFromSource("historyPath", sourcePath)
        focusModalField(modalOrchestratorHistoryPathInputRef)
        return
      case "orchestrator_instruction":
        switchModalOrchestratorInstructionMode("template")
        insertTemplateIntoModalStringField(
          "instruction",
          modalConfigObject.instruction,
          sourcePath,
          modalOrchestratorInstructionTextareaRef
        )
        return
      case "output_template":
        insertTemplateIntoModalStringField(
          "template",
          modalConfigObject.template,
          sourcePath,
          modalOutputTemplateTextareaRef,
          { structured: true }
        )
        return
    }
  }

  const renderModalSuggestions = (
    fieldId: string,
    onSelect: (sourcePath: string) => void
  ) => {
    if (modalSuggestionState?.fieldId !== fieldId || modalInlineSuggestions.length === 0) {
      return null
    }

    return (
      <div className="mt-2 rounded-md border border-cyan-400/30 bg-[#07111f] p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-cyan-200">
          {modalSuggestionState.mode === "path" ? "Field Suggestions" : "Insert Field Token"}
        </div>
        {modalInlineSuggestions.map((suggestion) => (
          <button
            key={`${fieldId}_${suggestion.sourcePath}`}
            type="button"
            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-left hover:border-cyan-400/40 hover:bg-cyan-950/20"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelect(suggestion.sourcePath)
              setModalSuggestionState(null)
            }}
          >
            <div className="truncate font-mono text-[11px] text-zinc-100">{suggestion.sourcePath}</div>
            <div className="truncate text-[10px] text-zinc-500">
              {suggestion.label}
              {suggestion.preview ? ` • ${suggestion.preview}` : ""}
            </div>
          </button>
        ))}
      </div>
    )
  }

  const runFlow = async () => {
    if (!currentFlow) return
    try {
      setRunning(true)
      setError(null)
      clearExecutionPlayback()
      const didSave = await saveFlow()
      if (!didSave) return

      const input = runInput.trim() ? JSON.parse(runInput) : {}
      const response = await studioAPI.executeFlow(currentFlow.id, input, true)
      const result = response.data.data
      setSelectedRunId(null)
      setSelectedEdgeId(null)
      setInspectorTab("run")
      setRunResult(result)
      const playbackSteps = buildExecutionPlaybackSteps(result, edges)
      setExecutionPlaybackSteps(playbackSteps)
      setExecutionPlaybackIndex(-1)
      setExecutionPlaybackRunning(playbackSteps.length > 0)
      await loadRuns(currentFlow.id)
    } catch (err: any) {
      setError(err.message || "Failed to run flow")
    } finally {
      setRunning(false)
    }
  }

  const sendChatMessage = async () => {
    if (!currentFlow || !hasChatNode) return
    const message = chatInput.trim()
    if (!message) return

    const userMessage: StudioChatMessage = {
      id: `chat_user_${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      status: "done",
    }
    const assistantPlaceholderId = `chat_pending_${Date.now()}`
    const assistantPlaceholder: StudioChatMessage = {
      id: assistantPlaceholderId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "pending",
    }

    try {
      setChatRunning(true)
      setError(null)
      clearExecutionPlayback()
      const didSave = await saveFlow()
      if (!didSave) return

      const priorHistory = chatMessages.map((item) => ({ role: item.role, content: item.content }))
      setChatMessages((previous) => [...previous, userMessage, assistantPlaceholder])
      setChatInput("")

      const response = await studioAPI.chatFlow(currentFlow.id, {
        message,
        history: priorHistory,
        conversationId: chatConversationId,
        trace: true,
      })
      const result = response.data.data
      const assistantReply = extractChatReply(result)
      const runId = String(result?.run_id || "")
      const assistantMessage: StudioChatMessage = {
        id: `chat_assistant_${runId || Date.now()}`,
        role: "assistant",
        content: assistantReply || "The flow completed without a reply message.",
        runId: runId || undefined,
        createdAt: new Date().toISOString(),
        status: "done",
      }
      setChatMessages((previous) =>
        previous.map((item) => (item.id === assistantPlaceholderId ? assistantMessage : item))
      )
      setChatConversationId(
        String(result?.output?.conversationId || chatConversationId || `studio_chat_${Date.now()}`)
      )
      setSelectedRunId(null)
      setSelectedEdgeId(null)
      setInspectorTab("run")
      setRunResult(result)
      const playbackSteps = buildExecutionPlaybackSteps(result, edges)
      setExecutionPlaybackSteps(playbackSteps)
      setExecutionPlaybackIndex(-1)
      setExecutionPlaybackRunning(playbackSteps.length > 0)
      await loadRuns(currentFlow.id)
    } catch (err: any) {
      setError(err.message || "Failed to send Studio chat message")
      setChatMessages((previous) =>
        previous.filter((item) => item.id !== userMessage.id && item.id !== assistantPlaceholderId)
      )
      setChatInput(message)
    } finally {
      setChatRunning(false)
    }
  }

  const inspectSavedRun = (run: StudioRun) => {
    const trace = Array.isArray(run.executionTrace) ? run.executionTrace : []
    const result = {
      run_id: run.id,
      flow_id: run.flowId,
      output: run.output,
      error: run.error,
      duration_ms: run.durationMs,
      node_results: run.nodeResults || {},
      executed_nodes:
        trace.length > 0
          ? trace.map((step) => step.nodeId)
          : Object.keys(run.nodeResults || {}),
      execution_trace: trace,
    }
    setSelectedRunId(run.id)
    setSelectedEdgeId(null)
    setInspectorTab("run")
    setRunResult(result)
    const playbackSteps = buildExecutionPlaybackSteps(result, edges)
    setExecutionPlaybackSteps(playbackSteps)
    setExecutionPlaybackIndex(-1)
    setExecutionPlaybackRunning(playbackSteps.length > 0)

    if (run.triggeredBy === "chat") {
      const userContent =
        String(run.triggerPayload?.chat?.message || run.triggerPayload?.body?.message || "").trim()
      const assistantContent = extractChatReply(result)
      const replayMessages: StudioChatMessage[] = []
      if (userContent) {
        replayMessages.push({
          id: `inspect_user_${run.id}`,
          role: "user",
          content: userContent,
          runId: run.id,
          createdAt: run.startedAt,
        })
      }
      if (assistantContent) {
        replayMessages.push({
          id: `inspect_assistant_${run.id}`,
          role: "assistant",
          content: assistantContent,
          runId: run.id,
          createdAt: run.endedAt,
        })
      }
      if (replayMessages.length > 0) {
        setChatMessages(replayMessages)
      }
      setChatConversationId(
        String(
          run.output?.conversationId || run.triggerPayload?.chat?.conversationId || `studio_chat_${run.id}`
        )
      )
    }
  }

  const testSelectedNode = async () => {
    if (!currentFlow || !selectedNode) return
    try {
      setTestingNode(true)
      setError(null)
      const didSave = await saveFlow()
      if (!didSave) return
      const payload = normalizeNodeTestPayload(selectedNode.data.kind as StudioNodeType, nodeTestInput)
      const response = await studioAPI.testNode(currentFlow.id, selectedNode.id, payload)
      setNodeTestResult(response.data.data)
    } catch (err: any) {
      setError(err.message || "Failed to test selected node")
    } finally {
      setTestingNode(false)
    }
  }

  const testModalNode = async () => {
    if (!currentFlow || !modalNode) return
    try {
      setTestingNode(true)
      setModalNodeTestError(null)
      setNodeTestResult(null)
      const nextState = commitModalNodeConfig()
      if (!nextState) return
      const didSave = await saveFlow(
        { nodes: nextState.nextNodes },
        {
          suppressPageError: true,
          onError: (message) => setModalNodeTestError(message),
        }
      )
      if (!didSave) return
      const payload = normalizeNodeTestPayload(modalNode.data.kind as StudioNodeType, nodeTestInput)
      const response = await studioAPI.testNode(currentFlow.id, modalNode.id, payload)
      setNodeTestResult(response.data.data)
      setModalNodeTestError(null)
    } catch (err: any) {
      setModalNodeTestError(err.message || "Failed to test selected node")
    } finally {
      setTestingNode(false)
    }
  }

  const generateCode = async () => {
    if (!currentFlow) return
    try {
      setGeneratingCode(true)
      setError(null)
      const didSave = await saveFlow()
      if (!didSave) return
      const response = await studioAPI.generateCode(currentFlow.id, codeLanguage)
      setCodegen(response.data.data as StudioCodegen)
    } catch (err: any) {
      setError(err.message || "Failed to generate code")
    } finally {
      setGeneratingCode(false)
    }
  }

  const openStackblitz = () => {
    if (!codegen?.stackblitzProject) return
    sdk.openProject(
      {
        title: codegen.stackblitzProject.title,
        description: codegen.stackblitzProject.description,
        template: "javascript",
        files: codegen.stackblitzProject.files,
      },
      {
        newWindow: true,
        openFile: "index.js",
      }
    )
  }

  const copyWebhook = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
  }

  const renderChatPanel = (expanded = false) => {
    const containerWidth = expanded
      ? Math.max(320, Math.min(920, (typeof window !== "undefined" ? window.innerWidth : 920) - 56))
      : chatPanelRect.width
    const compactLayout = containerWidth < 420

    return (
      <div
        className={cn(
          "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
          expanded ? "min-h-[72vh]" : "min-h-0"
        )}
      >
        <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,30,58,0.92),rgba(6,10,18,0.92))] px-4 py-3">
          <div className={cn("flex gap-3", compactLayout ? "flex-col" : "items-start justify-between")}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-300">
                  {chatNode?.data?.label || "Chat Input"}
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                  {chatMessages.filter((message) => message.status !== "pending").length} message
                  {chatMessages.filter((message) => message.status !== "pending").length === 1 ? "" : "s"}
                </div>
                {chatRunning && (
                  <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200">
                    Assistant is replying
                  </div>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-zinc-300">{chatWelcomeMessage}</p>
            </div>
            <div className={cn("text-[11px] text-zinc-500", compactLayout ? "" : "text-right")}>
              <div>Conversation</div>
              <div className="truncate font-mono text-[10px] text-zinc-400">
                {chatConversationId}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={expanded ? chatModalScrollRef : chatInlineScrollRef}
          className="min-h-0 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,rgba(14,34,59,0.25),transparent_48%),linear-gradient(180deg,rgba(5,11,22,0.98),rgba(4,7,13,0.98))] px-3 py-3"
        >
          <div className="space-y-3">
            {chatMessages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-500/30 bg-sky-950/10 p-4 text-[12px] leading-6 text-zinc-300">
                Start here. Your message enters the <code>chat</code> node, moves through the connected AI or orchestrator, and the latest reply stays pinned at the bottom of this panel.
              </div>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "w-full",
                    message.role === "user" ? "flex justify-end" : "flex justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]",
                      compactLayout ? "max-w-full" : "max-w-[88%]",
                      message.role === "user"
                        ? "border-sky-400/30 bg-[linear-gradient(135deg,rgba(14,99,182,0.5),rgba(5,34,62,0.92))] text-sky-50"
                        : "border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] text-zinc-100"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-300/80">
                        {message.role === "user" ? "You" : "Assistant"}
                      </div>
                      <div className="text-[10px] text-zinc-400/80">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    {message.status === "pending" ? (
                      <div className="flex items-center gap-1.5 py-1 text-sky-200">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-300" />
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-300 [animation-delay:120ms]" />
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-300 [animation-delay:240ms]" />
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.content}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#060b14] px-4 py-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-zinc-400">
            Studio sends <code>message</code>, <code>history</code>, and <code>conversationId</code> into <code>trigger.chat</code>. The run output below still shows traces and tool usage.
          </div>
          <div className="mt-3 space-y-3">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void sendChatMessage()
                }
              }}
              placeholder={chatPlaceholder}
              className={cn(
                "w-full rounded-2xl border border-white/15 bg-black/40 p-3 text-sm text-zinc-100 outline-none transition focus:border-sky-400/40 focus:ring-2 focus:ring-sky-500/20",
                expanded ? "min-h-[152px]" : compactLayout ? "min-h-[84px]" : "min-h-[108px]"
              )}
            />
            <div
              className={cn(
                "flex gap-2",
                compactLayout ? "flex-col items-stretch" : "items-center justify-between"
              )}
            >
              <div className="text-[11px] leading-5 text-zinc-500">
                Press <code>Enter</code> to send. Use <code>Shift+Enter</code> for a new line.
              </div>
              <Button
                onClick={() => void sendChatMessage()}
                disabled={chatRunning || !chatInput.trim()}
                className={cn("gap-2", compactLayout ? "w-full" : "")}
              >
                <SendHorizontal className="h-4 w-4" />
                {chatRunning ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const defaultChatPanelRect = getDefaultChatPanelRect()
  const chatPanelLayoutDirty =
    hasChatNode &&
    (chatPanelCollapsed ||
      Math.abs(chatPanelRect.x - defaultChatPanelRect.x) > 1 ||
      Math.abs(chatPanelRect.y - defaultChatPanelRect.y) > 1 ||
      Math.abs(chatPanelRect.width - defaultChatPanelRect.width) > 1 ||
      Math.abs(chatPanelRect.height - defaultChatPanelRect.height) > 1)
  const desktopResizableLayout = !focusMode && isDesktopLayout
  const layoutDirty =
    leftPanelCollapsed ||
    outputPanelCollapsed ||
    leftPanelWidth !== DEFAULT_LEFT_PANEL_WIDTH ||
    outputPanelHeight !== DEFAULT_OUTPUT_PANEL_HEIGHT ||
    chatPanelLayoutDirty
  const outputPanelExpanded = outputPanelHeight >= DEFAULT_OUTPUT_PANEL_HEIGHT + 120
  const editorExpanded = leftPanelCollapsed && outputPanelCollapsed
  const studioLayoutStyle = desktopResizableLayout
    ? {
        gridTemplateColumns: leftPanelCollapsed
          ? "minmax(0, 1fr)"
          : `${leftPanelWidth}px 12px minmax(0, 1fr)`,
        gridTemplateRows: outputPanelCollapsed
          ? "minmax(0, 1fr)"
          : `minmax(0, 1fr) 12px ${outputPanelHeight}px`,
      }
    : undefined

  if (loading) {
    return <div className="text-sm text-zinc-400">Loading Studio...</div>
  }

  return (
    <div ref={pageRef} className={cn("space-y-4", focusMode && "h-screen bg-[#09090b] p-3")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Workflow className="h-7 w-7 text-cyan-300" />
            Studio Builder
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Build chat or webhook-driven no-code workflows with HTTP, Memory, WebSocket, AI, branching, and loops.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={focusMode ? "default" : "outline"}
            onClick={() => setFocusMode(prev => !prev)}
            className="gap-2"
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {focusMode ? "Exit Focus" : "Focus Mode"}
          </Button>
          <Button
            variant="outline"
            onClick={toggleBrowserFullscreen}
            className="gap-2"
          >
            {browserFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {browserFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
          {!focusMode && (
            <>
              <Button variant="outline" onClick={expandStudioEditor} className="gap-2">
                <Maximize2 className="h-4 w-4" />
                {editorExpanded ? "Editor Expanded" : "Expand Editor"}
              </Button>
              {leftPanelCollapsed && (
                <Button variant="outline" onClick={toggleLeftPanel} className="gap-2">
                  <ChevronRight className="h-4 w-4" />
                  Show Flows
                </Button>
              )}
              {outputPanelCollapsed && (
                <Button variant="outline" onClick={toggleOutputPanel} className="gap-2">
                  <ChevronUp className="h-4 w-4" />
                  Show Output
                </Button>
              )}
              <Button
                variant="outline"
                onClick={resetStudioLayout}
                disabled={!layoutDirty}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Layout
              </Button>
            </>
          )}
          <Button variant="outline" onClick={createBlankFlow} className="gap-2">
            <Plus className="h-4 w-4" />
            New Flow
          </Button>
                <Button variant="outline" onClick={() => createSampleFlow("simple_url")} className="gap-2">
                  <Globe className="h-4 w-4" />
                  Demo URL
                </Button>
                <Button variant="outline" onClick={() => createSampleFlow("simple_body")} className="gap-2">
                  <Globe className="h-4 w-4" />
                  Demo Body
                </Button>
                <Button variant="outline" onClick={() => createSampleFlow("loop_users")} className="gap-2">
            <Layers className="h-4 w-4" />
            Sample Loop
          </Button>
          <Button variant="outline" onClick={() => createSampleFlow("ai_basic")} className="gap-2">
            <Bot className="h-4 w-4" />
            Sample AI
          </Button>
          <Button variant="outline" onClick={() => createSampleFlow("ai_orchestrator")} className="gap-2">
            <Cpu className="h-4 w-4" />
            Sample Orchestrator
          </Button>
          <Button onClick={() => void saveFlow()} disabled={!currentFlow || saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div
        ref={layoutRef}
        className={cn(
          "grid gap-4",
          focusMode
            ? "grid-cols-1 h-[calc(100vh-6rem)]"
            : "grid-cols-1 h-[calc(100vh-11rem)]"
        )}
        style={studioLayoutStyle}
      >
        {!focusMode && !leftPanelCollapsed && (
          <Card
            className="h-full overflow-hidden bg-black/30 border-white/10"
            style={
              desktopResizableLayout
                ? {
                    gridColumn: "1",
                    gridRow: outputPanelCollapsed ? "1" : "1 / span 3",
                  }
                : undefined
            }
          >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Flows</CardTitle>
                <CardDescription>Select, run, manage, and scroll older Studio flows</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={toggleLeftPanel}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Collapse
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto h-[calc(100%-6.5rem)]">
            <div className="max-h-[13.5rem] space-y-2 overflow-y-auto pr-1">
              {flows.length === 0 && (
                <p className="text-xs text-zinc-500">No flows yet. Create one or start with sample.</p>
              )}
              {flows.map((flow) => (
                <div
                  key={flow.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-2 py-2 transition-colors",
                    currentFlow?.id === flow.id
                      ? "border-cyan-400/60 bg-cyan-900/20"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                >
                  <button
                    onClick={() => loadFlow(flow.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-sm font-semibold text-white truncate">{flow.name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>{flow.status}</span>
                      {flow.isSample && <span className="text-emerald-300">sample</span>}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-red-300"
                    disabled={deletingFlowId === flow.id}
                    onClick={() => deleteFlowById(flow.id)}
                  >
                    {deletingFlowId === flow.id ? "..." : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>

            {currentFlow && (
              <>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Webhook URL</div>
                  <div className="text-xs text-zinc-200 break-all">{webhookUrl}</div>
                  <Button size="sm" variant="outline" onClick={copyWebhook} className="gap-2 w-full">
                    <Copy className="h-3.5 w-3.5" />
                    Copy Webhook
                  </Button>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400 mb-2">Add Node</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => addNode("chat")} className="gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Chat
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("webhook")} className="gap-1.5">
                      <Flag className="h-3.5 w-3.5" />
                      Webhook
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("http")} className="gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      HTTP
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("memory")} className="gap-1.5">
                      <Brain className="h-3.5 w-3.5" />
                      Memory
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("websocket")} className="gap-1.5">
                      <Radio className="h-3.5 w-3.5" />
                      WebSocket
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("condition")} className="gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      If / Else
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("ai")} className="gap-1.5">
                      <Bot className="h-3.5 w-3.5" />
                      AI
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("orchestrator")} className="gap-1.5">
                      <Cpu className="h-3.5 w-3.5" />
                      Orchestrator
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("loop")} className="gap-1.5">
                      <Repeat className="h-3.5 w-3.5" />
                      Loop
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addNode("output")} className="gap-1.5 col-span-2">
                      <Terminal className="h-3.5 w-3.5" />
                      Output
                    </Button>
                  </div>
                </div>

                {hasWebhookNode && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-wide text-zinc-400">Webhook Body for Manual Run</div>
                    <p className="text-[11px] text-zinc-500">
                      Enter the webhook body JSON only. Studio wraps it as <code>trigger.body</code> and passes that body to the next node as default <code>input</code>.
                    </p>
                    <textarea
                      value={runInput}
                      onChange={(e) => setRunInput(e.target.value)}
                      className="w-full min-h-[120px] rounded-md border border-white/15 bg-black/40 text-xs text-zinc-100 p-2 font-mono"
                    />
                    <Button onClick={runFlow} disabled={running} className="w-full gap-2">
                      <Play className="h-4 w-4" />
                      {running ? "Running..." : "Run Flow"}
                    </Button>
                    {executionPlaybackSteps.length > 0 && (
                      <div className="rounded-md border border-cyan-500/30 bg-cyan-950/20 p-2 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="uppercase tracking-wide text-cyan-200">Flow Playback</span>
                          <span className="text-cyan-100">{playbackProgressLabel}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={replayExecutionPlayback}
                            disabled={executionPlaybackRunning || executionPlaybackSteps.length === 0}
                          >
                            {executionPlaybackRunning ? "Playing..." : "Replay"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={clearExecutionPlayback}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {hasChatNode && !hasWebhookNode && (
                  <div className="rounded-lg border border-sky-500/25 bg-sky-950/15 p-3 text-[11px] text-zinc-300">
                    This flow uses a chat entry point. Use the chat panel on the canvas to talk to it and inspect tool usage in the output panel below.
                  </div>
                )}

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400 mb-2">Recent Runs</div>
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {runs.length === 0 && <p className="text-xs text-zinc-500">No runs yet</p>}
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className={cn(
                          "rounded-md border p-2 text-xs",
                          selectedRunId === run.id
                            ? "border-cyan-400/45 bg-cyan-950/20"
                            : "border-white/10"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={run.status === "success" ? "text-emerald-300" : "text-red-300"}>
                            {run.status}
                          </span>
                          <span className="text-zinc-500">{run.durationMs}ms</span>
                        </div>
                        <div className="text-zinc-400 mt-1">{new Date(run.startedAt).toLocaleString()}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 mt-2 px-2 text-[11px] w-full"
                          onClick={() => inspectSavedRun(run)}
                        >
                          Inspect This Run
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-400 mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Flow History
                  </div>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {history.length === 0 && <p className="text-xs text-zinc-500">No history snapshots yet</p>}
                    {history.map((item) => (
                      <div key={item.id} className="rounded-md border border-white/10 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-zinc-200 truncate">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => restoreHistoryVersion(item.id)}
                            disabled={restoringHistoryId === item.id}
                          >
                            {restoringHistoryId === item.id ? "..." : "Restore"}
                          </Button>
                        </div>
                        <div className="text-zinc-500 mt-1">
                          {item.reason || "snapshot"} • {item.snapshot.nodes?.length || 0} nodes
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}

        {desktopResizableLayout && !leftPanelCollapsed && (
          <div
            className="hidden xl:flex items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-500 cursor-col-resize hover:bg-white/10 hover:text-zinc-200"
            style={{ gridColumn: "2", gridRow: outputPanelCollapsed ? "1" : "1 / span 3" }}
            onMouseDown={startLeftPanelResize}
            title="Drag to resize flows panel"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        <Card
          className="h-full overflow-hidden bg-black/30 border-white/10"
          style={
            desktopResizableLayout
              ? {
                  gridColumn: leftPanelCollapsed ? "1" : "3",
                  gridRow: "1",
                }
              : undefined
          }
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {currentFlow ? currentFlow.name : "Canvas"}
                </CardTitle>
                <CardDescription>
                  Connect nodes to define orchestration order. Select nodes for run inspection, double-click to edit, and right-click for node actions.
                </CardDescription>
              </div>
              {!focusMode && (
                <div className="flex flex-wrap justify-end gap-2">
                  {!leftPanelCollapsed && (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={toggleLeftPanel}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Hide Flows
                    </Button>
                  )}
                  {!outputPanelCollapsed && (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={toggleOutputPanel}>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Hide Output
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={expandStudioEditor}>
                    <Maximize2 className="h-3.5 w-3.5" />
                    Expand Editor
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-5.5rem)]">
            {currentFlow ? (
              <div ref={canvasRef} className="relative h-full">
                <ReactFlow
                  nodes={renderedNodes}
                  edges={renderedEdges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_event, node) => {
                    setSelectedNodeId(node.id)
                    setSelectedEdgeId(null)
                  }}
                  onEdgeClick={(_event, edge) => {
                    setSelectedEdgeId(edge.id)
                    setInspectorTab("run")
                  }}
                  onNodeDoubleClick={(_event, node) => openNodeConfigModal(node.id)}
                  onNodeContextMenu={onNodeContextMenu}
                  onPaneClick={() => {
                    setNodeContextMenu(null)
                    setSelectedEdgeId(null)
                  }}
                  onPaneContextMenu={() => {
                    setNodeContextMenu(null)
                    setSelectedEdgeId(null)
                  }}
                  fitView
                  nodeTypes={nodeTypes}
                  className="bg-gradient-to-br from-[#09090b] to-[#101329]"
                >
                  <MiniMap />
                  <Controls />
                  <Background gap={28} size={1} color="rgba(148, 163, 184, 0.2)" />
                </ReactFlow>
                {executionPlaybackSteps.length > 0 && (
                  <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-cyan-400/30 bg-black/75 px-2 py-1 text-[11px] text-cyan-100">
                    <div className="uppercase tracking-wide text-cyan-300/80">Run Playback</div>
                    <div>
                      {executionPlaybackRunning ? "Animating" : "Ready"} {playbackProgressLabel ? `(${playbackProgressLabel})` : ""}
                    </div>
                  </div>
                )}
                {hasChatNode && (
                  <>
                    {chatPanelCollapsed ? (
                      <div
                        className="absolute z-10"
                        style={{ left: chatPanelRect.x, top: chatPanelRect.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-2 border-sky-500/30 bg-[#07111f]/90 text-sky-100"
                          onClick={() => setChatPanelCollapsed(false)}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Open Chat
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="absolute z-10 overflow-hidden rounded-2xl border border-white/15 bg-[#050b16]/94 shadow-2xl backdrop-blur-sm"
                        style={{
                          left: chatPanelRect.x,
                          top: chatPanelRect.y,
                          width: chatPanelRect.width,
                          height: chatPanelRect.height,
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-white/5"
                            onMouseDown={startChatPanelDrag}
                          >
                            <GripVertical className="h-4 w-4 text-sky-300" />
                            <div className="min-w-0">
                              <div className="text-[11px] uppercase tracking-wide text-sky-300">
                                Chat Panel
                              </div>
                              <div className="truncate text-[11px] text-zinc-500">
                                Drag to move. Resize from the lower-right corner.
                              </div>
                            </div>
                          </button>
                          <div
                            className="flex items-center gap-2"
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <div className="hidden 2xl:block text-[10px] text-zinc-500">
                              {Math.round(chatPanelRect.width)} x {Math.round(chatPanelRect.height)}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={resetChatPanelLayout}
                            >
                              Reset
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setChatModalOpen(true)}
                            >
                              Expand
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setChatPanelCollapsed(true)}
                            >
                              Collapse
                            </Button>
                          </div>
                        </div>
                        {renderChatPanel(false)}
                        <button
                          type="button"
                          className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/40 text-zinc-300 hover:bg-white/10"
                          onMouseDown={startChatPanelResize}
                          title="Drag to resize chat panel"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
                {selectedNode && !nodeConfigModalOpen && (
                  <div className="absolute left-3 top-3 z-10 w-[320px] rounded-lg border border-white/15 bg-[#08101d]/92 p-3 shadow-2xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-cyan-300/80">Selected Node</div>
                        <div className="truncate text-sm font-semibold text-white">{selectedNode.data.label}</div>
                        <div className="text-[11px] text-zinc-500">{selectedNode.data.kind}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => openNodeConfigModal(selectedNode.id)}
                      >
                        Edit
                      </Button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 px-2 text-[11px]"
                        onClick={() => openNodeConfigModal(selectedNode.id)}
                      >
                        Open Modal
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => duplicateNodeById(selectedNode.id)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-red-300"
                        onClick={deleteSelectedNode}
                      >
                        Delete
                      </Button>
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Node properties only open in the modal editor now.
                    </div>
                  </div>
                )}
                {nodeContextMenu && contextMenuNode && (
                  <div
                    className="absolute z-20 w-52 rounded-md border border-white/20 bg-[#0b1020]/95 shadow-2xl p-1.5 space-y-1"
                    style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
                      {contextMenuNode.data.label}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-start px-2 text-[11px]"
                      onClick={() => openNodeConfigModal(contextMenuNode.id)}
                    >
                      Open Full Editor
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-start px-2 text-[11px]"
                      onClick={() => {
                        duplicateNodeById(contextMenuNode.id)
                        setNodeContextMenu(null)
                      }}
                    >
                      Duplicate Node
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-start px-2 text-[11px] text-red-300"
                      onClick={() => {
                        deleteNodeById(contextMenuNode.id)
                        setNodeContextMenu(null)
                      }}
                    >
                      Delete Node
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                Create or select a flow to start building.
              </div>
            )}
          </CardContent>
        </Card>

        {desktopResizableLayout && !outputPanelCollapsed && (
          <div
            className="hidden xl:flex items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-500 cursor-row-resize hover:bg-white/10 hover:text-zinc-200"
            style={{ gridColumn: leftPanelCollapsed ? "1" : "3", gridRow: "2" }}
            onMouseDown={startOutputPanelResize}
            title="Drag to resize execution output"
          >
            <GripHorizontal className="h-4 w-4" />
          </div>
        )}

        {!focusMode && !outputPanelCollapsed && (
        <Card
          className="h-full overflow-hidden bg-black/30 border-white/10"
          style={
            desktopResizableLayout
              ? {
                  gridColumn: leftPanelCollapsed ? "1" : "3",
                  gridRow: "3",
                }
              : undefined
          }
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Execution Output</CardTitle>
                <CardDescription>
                  Run data and generated code live here. Node properties open in their own modal.
                </CardDescription>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-[11px]"
                  onClick={toggleExpandedOutputPanel}
                >
                  {outputPanelExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {outputPanelExpanded ? "Normal Size" : "Expand Output"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-[11px]"
                  onClick={toggleOutputPanel}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Collapse
                </Button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={inspectorTab === "run" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => setInspectorTab("run")}
              >
                Run
              </Button>
              <Button
                size="sm"
                variant={inspectorTab === "code" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => setInspectorTab("code")}
              >
                Code
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto h-[calc(100%-6.5rem)]">
              

            {inspectorTab === "run" && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-zinc-400">Run Data Explorer</div>
                {selectedRunId ? (
                  <span className="text-[11px] text-cyan-200">Inspecting saved run</span>
                ) : (
                  <span className="text-[11px] text-zinc-500">Latest manual run</span>
                )}
              </div>
              {!runResult ? (
                <div className="text-xs text-zinc-500">Run a flow or inspect a saved run to view data per node.</div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border border-white/10 bg-black/40 p-3 text-[11px] text-zinc-300 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <div>
                      <span className="text-zinc-500">Flow status:</span>{" "}
                      <span className={runError ? "text-red-300" : "text-emerald-300"}>
                        {runError ? "failed" : "success"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Duration:</span> {runDurationMs}ms
                    </div>
                    <div>
                      <span className="text-zinc-500">Nodes executed:</span> {runNodeIdsForDisplay.length}
                    </div>
                    <div>
                      <span className="text-zinc-500">Trace steps:</span> {runTrace.length}
                    </div>
                  </div>

                  {runError && (
                    <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200">
                      {runError}
                    </div>
                  )}

                  <div className="rounded-md border border-white/10 bg-black/40 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">Flow Final Output</div>
                    <pre className="max-h-64 overflow-auto text-xs text-emerald-200">
                      {runResult.output === undefined
                        ? "undefined"
                        : JSON.stringify(runResult.output, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/40 p-3 space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-400">
                      Selected Connection Data
                    </div>
                    {selectedEdge && selectedEdgeRunDispatch ? (
                      <>
                        <div className="text-[11px] text-zinc-300">
                          {nodeLabelById.get(selectedEdge.source) || selectedEdge.source}{" -> "}
                          {nodeLabelById.get(selectedEdge.target) || selectedEdge.target}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Branch:{" "}
                          {String(
                            (selectedEdge.data as any)?.condition ||
                              selectedEdge.sourceHandle ||
                              "always"
                          )}
                        </div>
                        <pre className="max-h-44 overflow-auto text-xs text-cyan-100 bg-black/30 rounded p-2">
                          {JSON.stringify(
                            selectedEdgeRunDispatch.dispatch.inputSnapshot ??
                              runNodeResults[selectedEdge.source] ??
                              null,
                            null,
                            2
                          )}
                        </pre>
                      </>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        Click a connection line on the canvas to inspect data passed through it.
                      </div>
                    )}
                  </div>

                  {selectedNode && (
                    <div className="rounded-md border border-cyan-500/25 bg-cyan-950/20 p-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-cyan-200">
                        Selected Node Data: {selectedNode.data.label}
                      </div>
                      <div className="text-[11px] text-zinc-300">Input snapshot</div>
                      <pre className="max-h-40 overflow-auto text-xs text-cyan-100 bg-black/30 rounded p-2">
                        {JSON.stringify(selectedNodeLastTrace?.inputSnapshot ?? null, null, 2)}
                      </pre>
                      <div className="text-[11px] text-zinc-300">Output</div>
                      <pre className="max-h-40 overflow-auto text-xs text-cyan-100 bg-black/30 rounded p-2">
                        {JSON.stringify(runNodeResults[selectedNode.id] ?? null, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="rounded-md border border-white/10 bg-black/40 p-3 space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-400">Per-Node Outputs</div>
                    {runNodeIdsForDisplay.length === 0 ? (
                      <div className="text-xs text-zinc-500">No node outputs captured.</div>
                    ) : (
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {runNodeIdsForDisplay.map((nodeId) => (
                          <details
                            key={`run_node_${nodeId}`}
                            className="rounded border border-white/10 bg-black/35 p-2"
                            open={selectedNode?.id === nodeId}
                          >
                            <summary className="cursor-pointer text-[11px] text-zinc-200">
                              {nodeLabelById.get(nodeId) || nodeId}{" "}
                              <span className="text-zinc-500">({nodeId})</span>
                            </summary>
                            <pre className="mt-2 max-h-44 overflow-auto text-xs text-zinc-200">
                              {JSON.stringify(runNodeResults[nodeId] ?? null, null, 2)}
                            </pre>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>

                  <details className="rounded-md border border-white/10 bg-black/35 p-3">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-zinc-400">
                      Raw Run Payload
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto text-xs text-zinc-300">
                      {JSON.stringify(runResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
            )}

            {inspectorTab === "code" && (
            <>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-zinc-400">Code Generation</div>
                <select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value as "javascript" | "python")}
                  className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={generateCode} disabled={!currentFlow || generatingCode} className="gap-2">
                  <Code2 className="h-4 w-4" />
                  {generatingCode ? "Generating..." : "Generate"}
                </Button>
                {codegen?.language === "javascript" && codegen.stackblitzProject && (
                  <Button variant="outline" onClick={openStackblitz} className="gap-2">
                    <Box className="h-4 w-4" />
                    StackBlitz
                  </Button>
                )}
              </div>
              <pre className="bg-black/50 border border-white/10 rounded-md p-3 text-xs text-cyan-100 overflow-auto max-h-72">
                {codegen?.code || "Generate JavaScript/Python client code for this flow..."}
              </pre>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-zinc-400 space-y-1">
              <div className="flex items-center gap-2 text-zinc-300 font-medium">
                <LinkIcon className="h-3.5 w-3.5" />
                Template Tips
              </div>
              <p>Use placeholders like <code>{"{{trigger.body.event}}"}</code> and <code>{"{{nodes.node_id.data}}"}</code>.</p>
              <p>HTTP nodes expose response in <code>data</code>; output node returns final webhook payload.</p>
              <p>Use Field Picker + Data Mapping to drag or add fields without writing JSON paths manually.</p>
              <p>Use <code>Loop Items</code> + <code>item</code>/<code>done</code> branches for batch processing, and add a back-edge from <code>If / Else</code> for while-style loops.</p>
              <p>Use <code>AI Inference</code> for single prompt calls, and <code>AI Orchestrator</code> with <code>tool</code>/<code>next</code> branches to call connected tool nodes.</p>
            </div>
            </>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      <Dialog open={chatModalOpen} onOpenChange={setChatModalOpen}>
        <DialogContent
          portalContainer={browserFullscreen ? pageRef.current : undefined}
          className="max-w-[920px] border-white/20 bg-[#050b16] p-0 text-white"
        >
          <DialogHeader className="border-b border-white/10 px-5 py-4">
            <DialogTitle className="text-white">Studio Chat</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Expanded chat console for flows that start from a chat node.
            </DialogDescription>
          </DialogHeader>
          {renderChatPanel(true)}
        </DialogContent>
      </Dialog>

      <Dialog
        open={nodeConfigModalOpen && !!modalNode}
        onOpenChange={(open) => {
          setNodeConfigModalOpen(open)
          if (!open) {
            setModalConfigError(null)
            setModalNodeTestError(null)
          }
        }}
      >
        <DialogContent
          portalContainer={browserFullscreen ? pageRef.current : undefined}
          className="max-w-[99vw] w-[1480px] bg-[#0b1020] border-white/20 text-white p-0"
        >
          {modalNode && (
            <div className="max-h-[86vh] overflow-hidden flex flex-col">
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
                <DialogTitle className="text-white">Node Editor</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Configure this node in a dedicated workspace. The right-side field rail stays visible for drag/drop, and typing <code>{"{{"}</code> in variable fields opens inline suggestions.
                </DialogDescription>
              </DialogHeader>
              <div className="p-5 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400">Node Name</label>
                    <Input
                      value={modalNodeLabel}
                      onChange={(event) => setModalNodeLabel(event.target.value)}
                      placeholder="Node name"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400">Node Type</label>
                    <Input value={String(modalNode.data.kind || "")} readOnly />
                  </div>
                </div>
                <div className="rounded-md border border-cyan-500/25 bg-cyan-950/15 p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-cyan-200">Guided Quick Controls</div>
                  <div className="text-[11px] text-zinc-400">
                    These controls are optimized for non-technical editing. Advanced users can still edit JSON below.
                  </div>
                  {modalNode.data.kind === "webhook" && (
                    <div className="rounded-md border border-cyan-400/25 bg-black/20 p-3 space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-cyan-100">Webhook Input Model</div>
                      <p className="text-[11px] text-zinc-300">
                        This node only receives the webhook body JSON. Studio stores it as <code>trigger.body</code>
                        and sends that same body to the next node as the default <code>input</code>.
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-zinc-300">
                          <div className="font-medium text-cyan-100">What you type</div>
                          <div>Plain JSON body only</div>
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-zinc-300">
                          <div className="font-medium text-cyan-100">What the next node gets</div>
                          <div>The same payload as <code>input</code></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "chat" && (
                    <div className="space-y-3">
                      <div className="rounded-md border border-sky-500/25 bg-sky-950/10 p-3 space-y-2">
                        <div className="text-[11px] uppercase tracking-wide text-sky-100">Chat Input Node</div>
                        <p className="text-[11px] text-zinc-300">
                          The chat panel sends a plain message plus conversation history into <code>trigger.chat</code>. This node exposes that as the next node's <code>input</code>.
                        </p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <label className="text-[11px] text-zinc-400">Message Path</label>
                          <Input
                            ref={modalChatMessagePathInputRef}
                            value={String(modalConfigObject.messagePath || "trigger.chat.message")}
                            onChange={(event) => {
                              setModalConfigField("messagePath", event.target.value)
                              showPathSuggestions("chat_message_path", event.target.value)
                            }}
                            onFocus={(event) =>
                              showPathSuggestions("chat_message_path", event.currentTarget.value)
                            }
                            onClick={(event) =>
                              showPathSuggestions("chat_message_path", event.currentTarget.value)
                            }
                            onKeyUp={(event) =>
                              showPathSuggestions("chat_message_path", event.currentTarget.value)
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "chat_message_path"
                              )
                            }}
                            placeholder="trigger.chat.message"
                            list="studio-mapping-source-options"
                          />
                          {renderModalSuggestions("chat_message_path", (sourcePath) =>
                            setModalPathFieldFromSource("messagePath", sourcePath)
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">History Path</label>
                          <Input
                            ref={modalChatHistoryPathInputRef}
                            value={String(modalConfigObject.historyPath || "trigger.chat.history")}
                            onChange={(event) => {
                              setModalConfigField("historyPath", event.target.value)
                              showPathSuggestions("chat_history_path", event.target.value)
                            }}
                            onFocus={(event) =>
                              showPathSuggestions("chat_history_path", event.currentTarget.value)
                            }
                            onClick={(event) =>
                              showPathSuggestions("chat_history_path", event.currentTarget.value)
                            }
                            onKeyUp={(event) =>
                              showPathSuggestions("chat_history_path", event.currentTarget.value)
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "chat_history_path"
                              )
                            }}
                            placeholder="trigger.chat.history"
                            list="studio-mapping-source-options"
                          />
                          {renderModalSuggestions("chat_history_path", (sourcePath) =>
                            setModalPathFieldFromSource("historyPath", sourcePath)
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1.4fr_1fr]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Welcome Message</label>
                          <textarea
                            ref={modalChatWelcomeTextareaRef}
                            value={String(modalConfigObject.welcomeMessage || "")}
                            onChange={(event) => setModalConfigField("welcomeMessage", event.target.value)}
                            className="w-full min-h-[92px] rounded-md border border-white/15 bg-black/40 p-2 text-xs text-zinc-100"
                            placeholder="Ask the flow a question."
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Input Placeholder</label>
                          <Input
                            ref={modalChatPlaceholderInputRef}
                            value={String(modalConfigObject.placeholder || "")}
                            onChange={(event) => setModalConfigField("placeholder", event.target.value)}
                            placeholder="Type a message to start the flow..."
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "http" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[160px_1fr_160px]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Method</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={modalConfigObject.method || "GET"}
                            onChange={(event) => setModalConfigField("method", event.target.value)}
                          >
                            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">URL</label>
                          <Input
                            ref={modalHttpUrlInputRef}
                            value={String(modalConfigObject.url || "")}
                            onChange={(event) => {
                              setModalConfigField("url", event.target.value)
                              showTemplateSuggestions(
                                "http_url",
                                event.target.value,
                                event.target.selectionStart
                              )
                            }}
                            onFocus={(event) =>
                              showTemplateSuggestions(
                                "http_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onKeyUp={(event) =>
                              showTemplateSuggestions(
                                "http_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onClick={(event) =>
                              showTemplateSuggestions(
                                "http_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              insertTemplateIntoModalHttpField(
                                "url",
                                event.dataTransfer.getData("text/studio-source-path")
                              )
                            }}
                            placeholder="https://api.example.com/items/{{trigger.body.itemId}}"
                          />
                          {renderModalSuggestions("http_url", (sourcePath) =>
                            applyTemplateSuggestionToModalField(
                              "url",
                              modalConfigObject.url,
                              sourcePath,
                              modalHttpUrlInputRef
                            )
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Parse Response</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={String(modalConfigObject.parseAs || "auto")}
                            onChange={(event) => setModalConfigField("parseAs", event.target.value)}
                          >
                            <option value="auto">Auto</option>
                            <option value="json">JSON</option>
                            <option value="text">Text</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <label className="text-[11px] text-zinc-400">Headers</label>
                          <textarea
                            value={headersToText(modalConfigObject.headers)}
                            onChange={(event) =>
                              setModalConfigField(
                                "headers",
                                event.target.value.trim() ? parseHeadersText(event.target.value) : undefined
                              )
                            }
                            className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                            placeholder={"accept: application/json\ncontent-type: application/json"}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Body</label>
                          <textarea
                            ref={modalHttpBodyTextareaRef}
                            value={stringifyEditorValue(modalConfigObject.body)}
                            onChange={(event) => {
                              setModalHttpBodyText(event.target.value)
                              showTemplateSuggestions(
                                "http_body",
                                event.target.value,
                                event.target.selectionStart
                              )
                            }}
                            onFocus={(event) =>
                              showTemplateSuggestions(
                                "http_body",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onKeyUp={(event) =>
                              showTemplateSuggestions(
                                "http_body",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onClick={(event) =>
                              showTemplateSuggestions(
                                "http_body",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              insertTemplateIntoModalHttpField(
                                "body",
                                event.dataTransfer.getData("text/studio-source-path")
                              )
                            }}
                            className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                            placeholder={'{\n  "todoId": "{{trigger.body.todoId}}",\n  "note": "{{trigger.body.note}}"\n}'}
                          />
                          {renderModalSuggestions("http_body", (sourcePath) =>
                            applyTemplateSuggestionToModalField(
                              "body",
                              modalConfigObject.body,
                              sourcePath,
                              modalHttpBodyTextareaRef,
                              { httpBody: true }
                            )
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                        Drag a field into the URL or body. Studio inserts a token like <code>{"{{trigger.body.todoId}}"}</code>.
                        For path params, drop into the exact spot inside the URL. For JSON bodies, drop inside a quoted value. You can also type <code>{"{{"}</code> to open field suggestions while editing.
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "memory" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-3">
                        <div>
                          <label className="text-[11px] text-zinc-400">Action</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={modalConfigObject.action || "router"}
                            onChange={(event) => {
                              const nextAction = event.target.value
                              if (nextAction === "router") {
                                setModalConfigFields({
                                  action: nextAction,
                                  mode:
                                    String(modalConfigObject.mode || "").trim() || "conversation",
                                })
                                return
                              }
                              setModalConfigField("action", nextAction)
                            }}
                          >
                            {["router", "store", "create", "search", "retrieve"].map((action) => (
                              <option key={action} value={action}>
                                {action}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Auth Mode</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={String(modalConfigObject.authMode || "session")}
                            onChange={(event) => {
                              const nextMode = event.target.value
                              if (nextMode === "session") {
                                setModalConfigFields({
                                  authMode: nextMode,
                                  userId: "",
                                })
                                return
                              }
                              setModalConfigField("authMode", nextMode)
                            }}
                          >
                            <option value="session">Use current Studio user</option>
                            <option value="api_key">Use API key</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">
                            {String(modalConfigObject.authMode || "session") === "session"
                              ? "Current User ID"
                              : "User ID"}
                          </label>
                          <Input
                            ref={modalMemoryUserIdInputRef}
                            value={
                              String(modalConfigObject.authMode || "session") === "session"
                                ? String(user?.id || "")
                                : String(modalConfigObject.userId || "")
                            }
                            onChange={(event) => setModalConfigField("userId", event.target.value)}
                            disabled={String(modalConfigObject.authMode || "session") === "session"}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              if (String(modalConfigObject.authMode || "session") === "session") {
                                event.preventDefault()
                                return
                              }
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "memory_user_id"
                              )
                            }}
                            placeholder={
                              String(modalConfigObject.authMode || "session") === "session"
                                ? "Current Studio user session"
                                : "{{trigger.body.userId}}"
                            }
                          />
                        </div>
                      </div>

                      {String(modalConfigObject.authMode || "session") === "session" ? (
                        <div className="rounded-md border border-cyan-500/25 bg-cyan-950/10 p-3 text-[11px] text-zinc-300">
                          This node uses the logged-in Studio user, exactly like the playground.
                          {user?.id ? ` Current user: ${user.id}.` : ""}
                          {" "}No API key or manual user override is used for manual/chat runs.
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <label className="text-[11px] text-zinc-400">Base URL</label>
                            <Input
                              ref={modalMemoryBaseUrlInputRef}
                              value={String(modalConfigObject.baseUrl || "")}
                              onChange={(event) => setModalConfigField("baseUrl", event.target.value)}
                              placeholder="http://localhost:3000/api"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-zinc-400">API Key</label>
                            <Input
                              ref={modalMemoryApiKeyInputRef}
                              value={String(modalConfigObject.apiKey || "")}
                              onChange={(event) => setModalConfigField("apiKey", event.target.value)}
                              placeholder="paddie_api_key"
                            />
                          </div>
                        </div>
                      )}

                      {(modalConfigObject.action || "router") === "store" ||
                      (modalConfigObject.action || "router") === "create" ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <label className="text-[11px] text-zinc-400">Memory Content</label>
                            <textarea
                              ref={modalMemoryContentTextareaRef}
                              value={String(modalConfigObject.content || "")}
                              onChange={(event) => {
                                setModalConfigField("content", event.target.value)
                                showTemplateSuggestions(
                                  "memory_content",
                                  event.target.value,
                                  event.target.selectionStart
                                )
                              }}
                              onFocus={(event) =>
                                showTemplateSuggestions(
                                  "memory_content",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onKeyUp={(event) =>
                                showTemplateSuggestions(
                                  "memory_content",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onClick={(event) =>
                                showTemplateSuggestions(
                                  "memory_content",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onBlur={scheduleModalSuggestionClose}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault()
                                applyFieldCandidateToModalNode(
                                  event.dataTransfer.getData("text/studio-source-path"),
                                  "memory_content"
                                )
                              }}
                              className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                              placeholder="What should be stored in memory?"
                            />
                            {renderModalSuggestions("memory_content", (sourcePath) =>
                              applyTemplateSuggestionToModalField(
                                "content",
                                modalConfigObject.content,
                                sourcePath,
                                modalMemoryContentTextareaRef
                              )
                            )}
                          </div>
                          <div className="space-y-2">
                            <div>
                              <label className="text-[11px] text-zinc-400">Memory Type</label>
                              <Input
                                value={String(modalConfigObject.type || "semantic")}
                                onChange={(event) => setModalConfigField("type", event.target.value)}
                                placeholder="semantic"
                              />
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                              Use this mode when you want to save new knowledge from the flow into Paddie memory.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <label className="text-[11px] text-zinc-400">
                              {(modalConfigObject.action || "router") === "router"
                                ? String(modalConfigObject.mode || "conversation") === "conversation"
                                  ? "Conversation Input"
                                  : "Router Query"
                                : "Search Query"}
                            </label>
                            <textarea
                              ref={modalMemoryQueryTextareaRef}
                              value={String(modalConfigObject.query || "")}
                              onChange={(event) => {
                                setModalConfigField("query", event.target.value)
                                showTemplateSuggestions(
                                  "memory_query",
                                  event.target.value,
                                  event.target.selectionStart
                                )
                              }}
                              onFocus={(event) =>
                                showTemplateSuggestions(
                                  "memory_query",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onKeyUp={(event) =>
                                showTemplateSuggestions(
                                  "memory_query",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onClick={(event) =>
                                showTemplateSuggestions(
                                  "memory_query",
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart
                                )
                              }
                              onBlur={scheduleModalSuggestionClose}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault()
                                applyFieldCandidateToModalNode(
                                  event.dataTransfer.getData("text/studio-source-path"),
                                  "memory_query"
                                )
                              }}
                              className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                              placeholder={
                                (modalConfigObject.action || "router") === "router" &&
                                String(modalConfigObject.mode || "conversation") === "conversation"
                                  ? "What should the memory conversation router understand from this input?"
                                  : "What should memory search or route?"
                              }
                            />
                            {renderModalSuggestions("memory_query", (sourcePath) =>
                              applyTemplateSuggestionToModalField(
                                "query",
                                modalConfigObject.query,
                                sourcePath,
                                modalMemoryQueryTextareaRef
                              )
                            )}
                          </div>
                          <div className="space-y-2">
                            {(modalConfigObject.action || "router") === "router" ? (
                              <>
                                <div>
                                  <label className="text-[11px] text-zinc-400">Router Mode</label>
                                  <select
                                    className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                                    value={String(modalConfigObject.mode || "conversation")}
                                    onChange={(event) =>
                                      setModalConfigField("mode", event.target.value)
                                    }
                                  >
                                    <option value="conversation">
                                      Conversation (Default)
                                    </option>
                                    <option value="auto">Auto</option>
                                    <option value="retrieve">Retrieve only</option>
                                    <option value="store">Store only</option>
                                  </select>
                                  <div className="mt-1 text-[11px] text-zinc-400">
                                    Conversation matches the router retrieval format and can queue
                                    background storage when the message contains new memory.
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-400">Context</label>
                                  <textarea
                                    ref={modalMemoryContextTextareaRef}
                                    value={String(modalConfigObject.context || "")}
                                    onChange={(event) => {
                                      setModalConfigField("context", event.target.value)
                                      showTemplateSuggestions(
                                        "memory_context",
                                        event.target.value,
                                        event.target.selectionStart
                                      )
                                    }}
                                    onFocus={(event) =>
                                      showTemplateSuggestions(
                                        "memory_context",
                                        event.currentTarget.value,
                                        event.currentTarget.selectionStart
                                      )
                                    }
                                    onKeyUp={(event) =>
                                      showTemplateSuggestions(
                                        "memory_context",
                                        event.currentTarget.value,
                                        event.currentTarget.selectionStart
                                      )
                                    }
                                    onClick={(event) =>
                                      showTemplateSuggestions(
                                        "memory_context",
                                        event.currentTarget.value,
                                        event.currentTarget.selectionStart
                                      )
                                    }
                                    onBlur={scheduleModalSuggestionClose}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                      event.preventDefault()
                                      applyFieldCandidateToModalNode(
                                        event.dataTransfer.getData("text/studio-source-path"),
                                        "memory_context"
                                      )
                                    }}
                                    className="w-full min-h-[72px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                                    placeholder="Optional extra routing context"
                                  />
                                  {renderModalSuggestions("memory_context", (sourcePath) =>
                                    applyTemplateSuggestionToModalField(
                                      "context",
                                      modalConfigObject.context,
                                      sourcePath,
                                      modalMemoryContextTextareaRef
                                    )
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                  <label className="text-[11px] text-zinc-400">Strategy</label>
                                  <Input
                                    value={String(modalConfigObject.strategy || "auto")}
                                    onChange={(event) => setModalConfigField("strategy", event.target.value)}
                                    placeholder="auto"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-400">Limit</label>
                                  <Input
                                    value={String(modalConfigObject.limit || 10)}
                                    onChange={(event) =>
                                      setModalConfigField("limit", Number(event.target.value || 10))
                                    }
                                    placeholder="10"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                        Drop data into user ID, query, content, or context. New memory nodes start
                        in Conversation router mode by default so they can retrieve immediately and
                        queue storage in the background when needed.
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "condition" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[1.2fr_0.9fr_0.9fr_1fr]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Compare This Field</label>
                          <Input
                            ref={modalConditionLeftPathInputRef}
                            value={String(modalConfigObject.leftPath || "input")}
                            onChange={(event) => {
                              setModalConfigField("leftPath", event.target.value)
                              showPathSuggestions("condition_left_path", event.target.value)
                            }}
                            onFocus={(event) =>
                              showPathSuggestions("condition_left_path", event.currentTarget.value)
                            }
                            onClick={(event) =>
                              showPathSuggestions("condition_left_path", event.currentTarget.value)
                            }
                            onKeyUp={(event) =>
                              showPathSuggestions("condition_left_path", event.currentTarget.value)
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "condition_left_path"
                              )
                            }}
                            placeholder="input.amount"
                            list="studio-mapping-source-options"
                          />
                          {renderModalSuggestions("condition_left_path", (sourcePath) =>
                            setModalPathFieldFromSource("leftPath", sourcePath)
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Operator</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={modalConfigObject.operator || "exists"}
                            onChange={(event) => setModalConfigField("operator", event.target.value)}
                          >
                            {["exists", "not_exists", "equals", "not_equals", "contains", "greater_than", "less_than"].map((operator) => (
                              <option key={operator} value={operator}>
                                {operator}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Value Type</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={modalConfigObject.valueType || "string"}
                            onChange={(event) => setModalConfigField("valueType", event.target.value)}
                          >
                            {["string", "number", "boolean"].map((valueType) => (
                              <option key={valueType} value={valueType}>
                                {valueType}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Against This Value</label>
                          <Input
                            ref={modalConditionRightValueInputRef}
                            value={String(modalConfigObject.rightValue ?? "")}
                            onChange={(event) => {
                              setModalConfigField("rightValue", event.target.value)
                              showTemplateSuggestions(
                                "condition_right_value",
                                event.target.value,
                                event.target.selectionStart
                              )
                            }}
                            onFocus={(event) =>
                              showTemplateSuggestions(
                                "condition_right_value",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onClick={(event) =>
                              showTemplateSuggestions(
                                "condition_right_value",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onKeyUp={(event) =>
                              showTemplateSuggestions(
                                "condition_right_value",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "condition_right_value"
                              )
                            }}
                            placeholder="100"
                          />
                          {renderModalSuggestions("condition_right_value", (sourcePath) =>
                            applyTemplateSuggestionToModalField(
                              "rightValue",
                              modalConfigObject.rightValue,
                              sourcePath,
                              modalConditionRightValueInputRef
                            )
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-emerald-500/25 bg-emerald-950/10 p-3 text-[11px] text-zinc-300">
                          <div className="font-medium text-emerald-200 mb-1">True Branch</div>
                          When the comparison passes, Studio follows the <code>true</code> connection.
                        </div>
                        <div className="rounded-md border border-rose-500/25 bg-rose-950/10 p-3 text-[11px] text-zinc-300">
                          <div className="font-medium text-rose-200 mb-1">False Branch</div>
                          When the comparison fails, Studio follows the <code>false</code> connection.
                        </div>
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "loop" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Loop Through This List</label>
                          <Input
                            ref={modalLoopListPathInputRef}
                            value={String(modalConfigObject.listPath || "input")}
                            onChange={(event) => {
                              setModalConfigField("listPath", event.target.value)
                              showPathSuggestions("loop_list_path", event.target.value)
                            }}
                            onFocus={(event) =>
                              showPathSuggestions("loop_list_path", event.currentTarget.value)
                            }
                            onClick={(event) =>
                              showPathSuggestions("loop_list_path", event.currentTarget.value)
                            }
                            onKeyUp={(event) =>
                              showPathSuggestions("loop_list_path", event.currentTarget.value)
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "loop_list_path"
                              )
                            }}
                            placeholder="input.items"
                            list="studio-mapping-source-options"
                          />
                          {renderModalSuggestions("loop_list_path", (sourcePath) =>
                            setModalPathFieldFromSource("listPath", sourcePath)
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Item Name</label>
                          <Input
                            value={String(modalConfigObject.itemField || "item")}
                            onChange={(event) => setModalConfigField("itemField", event.target.value)}
                            placeholder="item"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Index Name</label>
                          <Input
                            value={String(modalConfigObject.indexField || "index")}
                            onChange={(event) => setModalConfigField("indexField", event.target.value)}
                            placeholder="index"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Max Items</label>
                          <Input
                            value={String(modalConfigObject.maxItems || 1000)}
                            onChange={(event) =>
                              setModalConfigField("maxItems", Number(event.target.value || 1000))
                            }
                            placeholder="1000"
                          />
                        </div>
                      </div>

                      <label className="text-xs text-zinc-300 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={modalConfigObject.includeOriginalInput !== false}
                          onChange={(event) =>
                            setModalConfigField("includeOriginalInput", event.target.checked)
                          }
                        />
                        Keep the original input on each loop item
                      </label>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-cyan-500/25 bg-cyan-950/10 p-3 text-[11px] text-zinc-300">
                          <div className="font-medium text-cyan-200 mb-1">Item Branch</div>
                          Runs once for each entry in the list. Each next node receives <code>item</code>, <code>index</code>, and loop metadata.
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/25 p-3 text-[11px] text-zinc-300">
                          <div className="font-medium text-zinc-100 mb-1">Done Branch</div>
                          Runs after the loop finishes and receives the summary count for the processed list.
                        </div>
                      </div>
                    </div>
                  )}
                  {(modalNode.data.kind === "ai" || modalNode.data.kind === "orchestrator") && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[0.9fr_0.9fr_1fr_auto]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Credentials</label>
                          <select
                            className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                            value={modalCredentialSource}
                            onChange={(event) =>
                              switchModalCredentialSource(
                                event.target.value === "byok" ? "byok" : "paddie_system"
                              )
                            }
                          >
                            <option value="paddie_system">Paddie GPT-4.1</option>
                            <option value="byok">Bring Your Own Key</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Provider</label>
                          {modalCredentialSource === "paddie_system" ? (
                            <Input value="Azure OpenAI (Paddie System)" disabled className="opacity-80" />
                          ) : (
                            <select
                              className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                              value={modalNodeProvider || "azure_openai"}
                              onChange={(event) =>
                                switchModalAIProvider(
                                  event.target.value as "azure_openai" | "openai" | "groq"
                                )
                              }
                            >
                              <option value="azure_openai">Azure OpenAI</option>
                              <option value="openai">OpenAI</option>
                              <option value="groq">Groq</option>
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">
                            {modalModelFieldKey === "deployment" ? "Deployment" : "Model"}
                          </label>
                          <Input
                            value={modalModelFieldValue}
                            onChange={(event) => setModalConfigField(modalModelFieldKey, event.target.value)}
                            placeholder="gpt-4.1"
                            list="studio-provider-model-options"
                          />
                        </div>
                        <div className="pt-[18px]">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 text-[11px]"
                            onClick={loadModelsForModalNode}
                            disabled={loadingProviderModels}
                          >
                            {loadingProviderModels
                              ? "Loading..."
                              : modalCredentialSource === "paddie_system"
                                ? "Load System"
                                : "Load Models"}
                          </Button>
                        </div>
                      </div>

                      {providerModelsNodeId === modalNode.id && providerModels.length > 0 && (
                        <>
                          <datalist id="studio-provider-model-options">
                            {providerModels.map((modelId) => (
                              <option key={modelId} value={modelId} />
                            ))}
                          </datalist>
                          <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                            Models available for this provider: {providerModels.slice(0, 8).join(", ")}
                            {providerModels.length > 8 ? "..." : ""}
                          </div>
                        </>
                      )}

                      {modalCredentialSource === "paddie_system" ? (
                        <div className="rounded-md border border-cyan-500/25 bg-cyan-950/10 p-3 text-[11px] text-zinc-300">
                          This node uses Paddie&apos;s built-in Azure OpenAI GPT-4.1 setup. Choose this when
                          you want Studio chat and orchestration flows to run without pasting provider keys.
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-2 md:grid-cols-3">
                            <div>
                              <label className="text-[11px] text-zinc-400">API Key</label>
                              <Input
                                ref={
                                  modalNode.data.kind === "ai"
                                    ? modalAIApiKeyInputRef
                                    : modalOrchestratorApiKeyInputRef
                                }
                                value={String(modalConfigObject.apiKey || "")}
                                onChange={(event) => setModalConfigField("apiKey", event.target.value)}
                                placeholder="provider_api_key"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Endpoint</label>
                              <Input
                                ref={
                                  modalNode.data.kind === "ai"
                                    ? modalAIEndpointInputRef
                                    : modalOrchestratorEndpointInputRef
                                }
                                value={String(modalConfigObject.endpoint || "")}
                                onChange={(event) => setModalConfigField("endpoint", event.target.value)}
                                placeholder="https://..."
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">API Version</label>
                              <Input
                                ref={
                                  modalNode.data.kind === "ai"
                                    ? modalAIAPIVersionInputRef
                                    : modalOrchestratorAPIVersionInputRef
                                }
                                value={String(modalConfigObject.apiVersion || "")}
                                onChange={(event) => setModalConfigField("apiVersion", event.target.value)}
                                placeholder="2024-10-21"
                              />
                            </div>
                          </div>
                          <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                            Bring your own provider credentials when this node should run outside the Paddie
                            system model.
                          </div>
                        </>
                      )}

                      {modalNode.data.kind === "ai" ? (
                        <>
                          <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">Prompt Source</label>
                              <select
                                className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                                value={modalAIPromptMode}
                                onChange={(event) =>
                                  switchModalAIPromptMode(event.target.value as "path" | "template")
                                }
                              >
                                <option value="path">Use a field</option>
                                <option value="template">Write a prompt</option>
                              </select>
                            </div>
                            {modalAIPromptMode === "path" ? (
                              <div>
                                <label className="text-[11px] text-zinc-400">Input Path</label>
                                <Input
                                  ref={modalAIInputPathInputRef}
                                  value={String(modalConfigObject.inputPath || "input")}
                                  onChange={(event) => {
                                    setModalConfigField("inputPath", event.target.value)
                                    showPathSuggestions("ai_input_path", event.target.value)
                                  }}
                                  onFocus={(event) =>
                                    showPathSuggestions("ai_input_path", event.currentTarget.value)
                                  }
                                  onClick={(event) =>
                                    showPathSuggestions("ai_input_path", event.currentTarget.value)
                                  }
                                  onKeyUp={(event) =>
                                    showPathSuggestions("ai_input_path", event.currentTarget.value)
                                  }
                                  onBlur={scheduleModalSuggestionClose}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    applyFieldCandidateToModalNode(
                                      event.dataTransfer.getData("text/studio-source-path"),
                                      "ai_input_path"
                                    )
                                  }}
                                  placeholder="input.message"
                                  list="studio-mapping-source-options"
                                />
                                {renderModalSuggestions("ai_input_path", (sourcePath) =>
                                  setModalPathFieldFromSource("inputPath", sourcePath)
                                )}
                              </div>
                            ) : (
                              <div>
                                <label className="text-[11px] text-zinc-400">Prompt Template</label>
                                <textarea
                                  ref={modalAIPromptTextareaRef}
                                  value={String(modalConfigObject.promptTemplate || modalConfigObject.prompt || "")}
                                  onChange={(event) => {
                                    setModalConfigField("promptTemplate", event.target.value)
                                    showTemplateSuggestions(
                                      "ai_prompt",
                                      event.target.value,
                                      event.target.selectionStart
                                    )
                                  }}
                                  onFocus={(event) =>
                                    showTemplateSuggestions(
                                      "ai_prompt",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onClick={(event) =>
                                    showTemplateSuggestions(
                                      "ai_prompt",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    showTemplateSuggestions(
                                      "ai_prompt",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onBlur={scheduleModalSuggestionClose}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    applyFieldCandidateToModalNode(
                                      event.dataTransfer.getData("text/studio-source-path"),
                                      "ai_prompt"
                                    )
                                  }}
                                  className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                                  placeholder="Summarize this customer message: {{input.message}}"
                                />
                                {renderModalSuggestions("ai_prompt", (sourcePath) =>
                                  applyTemplateSuggestionToModalField(
                                    "promptTemplate",
                                    modalConfigObject.promptTemplate || modalConfigObject.prompt,
                                    sourcePath,
                                    modalAIPromptTextareaRef
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2 md:grid-cols-[1fr_1.2fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">History Path</label>
                              <Input
                                ref={modalAIHistoryPathInputRef}
                                value={String(modalConfigObject.historyPath || "input.history")}
                                onChange={(event) => {
                                  setModalConfigField("historyPath", event.target.value)
                                  showPathSuggestions("ai_history_path", event.target.value)
                                }}
                                onFocus={(event) =>
                                  showPathSuggestions("ai_history_path", event.currentTarget.value)
                                }
                                onClick={(event) =>
                                  showPathSuggestions("ai_history_path", event.currentTarget.value)
                                }
                                onKeyUp={(event) =>
                                  showPathSuggestions("ai_history_path", event.currentTarget.value)
                                }
                                onBlur={scheduleModalSuggestionClose}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  applyFieldCandidateToModalNode(
                                    event.dataTransfer.getData("text/studio-source-path"),
                                    "ai_history_path"
                                  )
                                }}
                                placeholder="input.history"
                                list="studio-mapping-source-options"
                              />
                              {renderModalSuggestions("ai_history_path", (sourcePath) =>
                                setModalPathFieldFromSource("historyPath", sourcePath)
                              )}
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                              For chat flows, the message is usually <code>input.message</code> and the
                              conversation array is <code>input.history</code>. Type <code>{"{{"}</code> in
                              the prompt template to pick variables without typing paths manually.
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">System Prompt</label>
                              <textarea
                                ref={modalAISystemPromptTextareaRef}
                                value={String(modalConfigObject.systemPrompt || "")}
                                onChange={(event) => setModalConfigField("systemPrompt", event.target.value)}
                                className="w-full min-h-[92px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                                placeholder="You are a helpful assistant."
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Temperature</label>
                              <Input
                                value={String(modalConfigObject.temperature ?? 0.3)}
                                onChange={(event) =>
                                  setModalConfigField("temperature", Number(event.target.value || 0))
                                }
                                placeholder="0.3"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Max Tokens</label>
                              <Input
                                value={String(modalConfigObject.maxTokens ?? 500)}
                                onChange={(event) =>
                                  setModalConfigField("maxTokens", Number(event.target.value || 0))
                                }
                                placeholder="500"
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">Instruction Source</label>
                              <select
                                className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs"
                                value={modalOrchestratorInstructionMode}
                                onChange={(event) =>
                                  switchModalOrchestratorInstructionMode(
                                    event.target.value as "path" | "template"
                                  )
                                }
                              >
                                <option value="path">Use a field</option>
                                <option value="template">Write instructions</option>
                              </select>
                            </div>
                            {modalOrchestratorInstructionMode === "path" ? (
                              <div>
                                <label className="text-[11px] text-zinc-400">Instruction Path</label>
                                <Input
                                  ref={modalOrchestratorInstructionPathInputRef}
                                  value={String(
                                    modalConfigObject.instructionPath || modalConfigObject.inputPath || "input"
                                  )}
                                  onChange={(event) =>
                                    {
                                      setModalConfigField("instructionPath", event.target.value)
                                      showPathSuggestions(
                                        "orchestrator_instruction_path",
                                        event.target.value
                                      )
                                    }
                                  }
                                  onFocus={(event) =>
                                    showPathSuggestions(
                                      "orchestrator_instruction_path",
                                      event.currentTarget.value
                                    )
                                  }
                                  onClick={(event) =>
                                    showPathSuggestions(
                                      "orchestrator_instruction_path",
                                      event.currentTarget.value
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    showPathSuggestions(
                                      "orchestrator_instruction_path",
                                      event.currentTarget.value
                                    )
                                  }
                                  onBlur={scheduleModalSuggestionClose}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    applyFieldCandidateToModalNode(
                                      event.dataTransfer.getData("text/studio-source-path"),
                                      "orchestrator_instruction_path"
                                    )
                                  }}
                                  placeholder="input.message"
                                  list="studio-mapping-source-options"
                                />
                                {renderModalSuggestions("orchestrator_instruction_path", (sourcePath) =>
                                  setModalPathFieldFromSource("instructionPath", sourcePath)
                                )}
                              </div>
                            ) : (
                              <div>
                                <label className="text-[11px] text-zinc-400">Instruction Template</label>
                                <textarea
                                  ref={modalOrchestratorInstructionTextareaRef}
                                  value={String(modalConfigObject.instruction || "")}
                                  onChange={(event) => {
                                    setModalConfigField("instruction", event.target.value)
                                    showTemplateSuggestions(
                                      "orchestrator_instruction",
                                      event.target.value,
                                      event.target.selectionStart
                                    )
                                  }}
                                  onFocus={(event) =>
                                    showTemplateSuggestions(
                                      "orchestrator_instruction",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onClick={(event) =>
                                    showTemplateSuggestions(
                                      "orchestrator_instruction",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    showTemplateSuggestions(
                                      "orchestrator_instruction",
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart
                                    )
                                  }
                                  onBlur={scheduleModalSuggestionClose}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    applyFieldCandidateToModalNode(
                                      event.dataTransfer.getData("text/studio-source-path"),
                                      "orchestrator_instruction"
                                    )
                                  }}
                                  className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                                  placeholder="Use the connected tools to solve: {{input.message}}"
                                />
                                {renderModalSuggestions("orchestrator_instruction", (sourcePath) =>
                                  applyTemplateSuggestionToModalField(
                                    "instruction",
                                    modalConfigObject.instruction,
                                    sourcePath,
                                    modalOrchestratorInstructionTextareaRef
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2 md:grid-cols-[1fr_1.2fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">History Path</label>
                              <Input
                                ref={modalOrchestratorHistoryPathInputRef}
                                value={String(modalConfigObject.historyPath || "input.history")}
                                onChange={(event) => {
                                  setModalConfigField("historyPath", event.target.value)
                                  showPathSuggestions("orchestrator_history_path", event.target.value)
                                }}
                                onFocus={(event) =>
                                  showPathSuggestions(
                                    "orchestrator_history_path",
                                    event.currentTarget.value
                                  )
                                }
                                onClick={(event) =>
                                  showPathSuggestions(
                                    "orchestrator_history_path",
                                    event.currentTarget.value
                                  )
                                }
                                onKeyUp={(event) =>
                                  showPathSuggestions(
                                    "orchestrator_history_path",
                                    event.currentTarget.value
                                  )
                                }
                                onBlur={scheduleModalSuggestionClose}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  applyFieldCandidateToModalNode(
                                    event.dataTransfer.getData("text/studio-source-path"),
                                    "orchestrator_history_path"
                                  )
                                }}
                                placeholder="input.history"
                                list="studio-mapping-source-options"
                              />
                              {renderModalSuggestions("orchestrator_history_path", (sourcePath) =>
                                setModalPathFieldFromSource("historyPath", sourcePath)
                              )}
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                              Use the chat message path, history path, and connected tool nodes together. The
                              orchestrator reads the conversation, decides when to call tools, then returns a
                              final assistant reply back to the Studio chat panel.
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
                            <div>
                              <label className="text-[11px] text-zinc-400">System Prompt</label>
                              <textarea
                                ref={modalOrchestratorSystemPromptTextareaRef}
                                value={String(modalConfigObject.systemPrompt || "")}
                                onChange={(event) => setModalConfigField("systemPrompt", event.target.value)}
                                className="w-full min-h-[92px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                                placeholder="You orchestrate tools and return the final result."
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Tool Calls</label>
                              <Input
                                value={String(modalConfigObject.maxToolCalls ?? 6)}
                                onChange={(event) =>
                                  setModalConfigField("maxToolCalls", Number(event.target.value || 1))
                                }
                                placeholder="6"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Temperature</label>
                              <Input
                                value={String(modalConfigObject.temperature ?? 0.2)}
                                onChange={(event) =>
                                  setModalConfigField("temperature", Number(event.target.value || 0))
                                }
                                placeholder="0.2"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-400">Max Tokens</label>
                              <Input
                                value={String(modalConfigObject.maxTokens ?? 800)}
                                onChange={(event) =>
                                  setModalConfigField("maxTokens", Number(event.target.value || 0))
                                }
                                placeholder="800"
                              />
                            </div>
                          </div>

                          <div className="rounded-md border border-white/10 bg-black/25 p-3 text-[11px] text-zinc-300">
                            <div className="font-medium text-zinc-100 mb-1">Connected Tool Nodes</div>
                            {modalOrchestratorToolEdges.length > 0
                              ? modalOrchestratorToolEdges
                                  .map((edge) => nodeLabelById.get(edge.target) || edge.target)
                                  .join(", ")
                              : "No tool nodes connected on the tool branch yet."}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {modalNode.data.kind === "websocket" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
                        <div>
                          <label className="text-[11px] text-zinc-400">WebSocket URL</label>
                          <Input
                            ref={modalWebsocketUrlInputRef}
                            value={String(modalConfigObject.url || "")}
                            onChange={(event) => {
                              setModalConfigField("url", event.target.value)
                              showTemplateSuggestions(
                                "websocket_url",
                                event.target.value,
                                event.target.selectionStart
                              )
                            }}
                            onFocus={(event) =>
                              showTemplateSuggestions(
                                "websocket_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onClick={(event) =>
                              showTemplateSuggestions(
                                "websocket_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onKeyUp={(event) =>
                              showTemplateSuggestions(
                                "websocket_url",
                                event.currentTarget.value,
                                event.currentTarget.selectionStart
                              )
                            }
                            onBlur={scheduleModalSuggestionClose}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              applyFieldCandidateToModalNode(
                                event.dataTransfer.getData("text/studio-source-path"),
                                "websocket_url"
                              )
                            }}
                            placeholder="wss://echo.websocket.events"
                          />
                          {renderModalSuggestions("websocket_url", (sourcePath) =>
                            applyTemplateSuggestionToModalField(
                              "url",
                              modalConfigObject.url,
                              sourcePath,
                              modalWebsocketUrlInputRef
                            )
                          )}
                        </div>
                        <div className="flex items-end">
                          <label className="text-xs text-zinc-300 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={modalConfigObject.waitForResponse !== false}
                              onChange={(event) =>
                                setModalConfigField("waitForResponse", event.target.checked)
                              }
                            />
                            Wait for response
                          </label>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400">Timeout (ms)</label>
                          <Input
                            value={String(modalConfigObject.timeoutMs || 7000)}
                            onChange={(event) =>
                              setModalConfigField("timeoutMs", Number(event.target.value || 7000))
                            }
                            placeholder="7000"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Message to Send</label>
                        <textarea
                          ref={modalWebsocketMessageTextareaRef}
                          value={String(modalConfigObject.message || "")}
                          onChange={(event) => {
                            setModalConfigField("message", event.target.value)
                            showTemplateSuggestions(
                              "websocket_message",
                              event.target.value,
                              event.target.selectionStart
                            )
                          }}
                          onFocus={(event) =>
                            showTemplateSuggestions(
                              "websocket_message",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onClick={(event) =>
                            showTemplateSuggestions(
                              "websocket_message",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onKeyUp={(event) =>
                            showTemplateSuggestions(
                              "websocket_message",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onBlur={scheduleModalSuggestionClose}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            applyFieldCandidateToModalNode(
                              event.dataTransfer.getData("text/studio-source-path"),
                              "websocket_message"
                            )
                          }}
                          className="w-full min-h-[110px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                          placeholder='{"event":"ping","value":"{{input.id}}"}'
                        />
                        {renderModalSuggestions("websocket_message", (sourcePath) =>
                          applyTemplateSuggestionToModalField(
                            "message",
                            modalConfigObject.message,
                            sourcePath,
                            modalWebsocketMessageTextareaRef
                          )
                        )}
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                        Drop data into the URL or message. If you wait for a response, the next node receives the returned message as <code>input.data</code>.
                      </div>
                    </div>
                  )}
                  {modalNode.data.kind === "output" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <div>
                          <label className="text-[11px] text-zinc-400">Response Message</label>
                          <Input
                            value={String(modalConfigObject.message || "")}
                            onChange={(event) => setModalConfigField("message", event.target.value)}
                            placeholder="Flow complete"
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="text-xs text-zinc-300 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={modalConfigObject.includeLastNodeData !== false}
                              onChange={(event) =>
                                setModalConfigField("includeLastNodeData", event.target.checked)
                              }
                            />
                            Include incoming data
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Response Template (optional)</label>
                        <textarea
                          ref={modalOutputTemplateTextareaRef}
                          value={stringifyEditorValue(modalConfigObject.template)}
                          onChange={(event) => {
                            setModalStructuredFieldText("template", event.target.value)
                            showTemplateSuggestions(
                              "output_template",
                              event.target.value,
                              event.target.selectionStart
                            )
                          }}
                          onFocus={(event) =>
                            showTemplateSuggestions(
                              "output_template",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onClick={(event) =>
                            showTemplateSuggestions(
                              "output_template",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onKeyUp={(event) =>
                            showTemplateSuggestions(
                              "output_template",
                              event.currentTarget.value,
                              event.currentTarget.selectionStart
                            )
                          }
                          onBlur={scheduleModalSuggestionClose}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            applyFieldCandidateToModalNode(
                              event.dataTransfer.getData("text/studio-source-path"),
                              "output_template"
                            )
                          }}
                          className="w-full min-h-[120px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                          placeholder={'{\n  "message": "Done",\n  "result": "{{input.data}}"\n}'}
                        />
                        {renderModalSuggestions("output_template", (sourcePath) =>
                          applyTemplateSuggestionToModalField(
                            "template",
                            modalConfigObject.template,
                            sourcePath,
                            modalOutputTemplateTextareaRef,
                            { structured: true }
                          )
                        )}
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-300">
                        Leave template empty to pass the incoming data through. Add a template when you want to shape the final webhook response.
                      </div>
                    </div>
                  )}
                </div>
                {modalNode.data.kind !== "webhook" && (
                  <div className="rounded-md border border-cyan-500/25 bg-cyan-950/10 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-cyan-200">Visual Data Mapper</div>
                        <div className="text-[11px] text-zinc-400">
                          Drag fields from the current webhook payload or latest run into mapping rows. This stays separate from flow-level output so the source of data is clearer.
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={autoMapModalFromLatestInput}
                          disabled={
                            (!selectedNodeLastTrace ||
                              typeof selectedNodeLastTrace.inputSnapshot !== "object") &&
                            (!manualWebhookPayload || typeof manualWebhookPayload !== "object")
                          }
                        >
                          Auto-Map
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={clearModalInputMappings}
                          disabled={modalInputMappings.length === 0}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={addModalInputMappingRow}
                        >
                          + Map Field
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_360px]">
                      <div className="space-y-3">
                        {selectedNodeLastTrace && (
                          <div className="rounded-md border border-white/10 bg-black/30 p-3 text-[11px] space-y-1">
                            <div className="text-cyan-200 font-medium">Latest input into this node</div>
                            <pre className="max-h-36 overflow-auto rounded bg-black/40 p-2 text-cyan-100">
                              {JSON.stringify(selectedNodeLastTrace.inputSnapshot, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!selectedNodeLastTrace &&
                          manualWebhookPayload &&
                          (modalNode.data.kind === "webhook" || selectedHasWebhookUpstream) && (
                            <div className="rounded-md border border-white/10 bg-black/30 p-3 text-[11px] space-y-1">
                              <div className="text-cyan-200 font-medium">Current webhook payload</div>
                              <pre className="max-h-36 overflow-auto rounded bg-black/40 p-2 text-cyan-100">
                                {JSON.stringify(manualWebhookPayload, null, 2)}
                              </pre>
                            </div>
                          )}

                        <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="text-xs text-zinc-300 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={modalConfigObject.passThroughInput === true}
                                onChange={(event) => setModalConfigField("passThroughInput", event.target.checked)}
                              />
                              Keep original input
                            </label>
                            {modalNode.data.kind !== "loop" ? (
                              <label className="text-xs text-zinc-300 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={modalConfigObject.iterate === true}
                                  onChange={(event) => setModalConfigField("iterate", event.target.checked)}
                                />
                                Run once per list item
                              </label>
                            ) : (
                              <div className="text-xs text-zinc-500">Loop nodes already iterate automatically.</div>
                            )}
                          </div>

                          {modalNode.data.kind !== "loop" && modalConfigObject.iterate === true && (
                            <div>
                              <label className="text-[11px] text-zinc-400">Iterate Path</label>
                              <Input
                                value={String(modalConfigObject.iteratePath || "input")}
                                onChange={(event) => setModalConfigField("iteratePath", event.target.value)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  setModalPathFieldFromSource(
                                    "iteratePath",
                                    event.dataTransfer.getData("text/studio-source-path")
                                  )
                                }}
                                placeholder="input.items"
                                list="studio-mapping-source-options"
                              />
                            </div>
                          )}
                        </div>

                        <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[11px] text-zinc-300 space-y-2">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-300">How To Map</div>
                          <p>Keep the field rail open on the right and drag fields directly into inputs, URLs, bodies, prompts, and templates.</p>
                          <p>Type <code>{"{{"}</code> inside variable fields to open inline suggestions. Studio will complete the token for you.</p>
                          <p>Use the mapping rows when you want to rename or reshape incoming data before this node runs.</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-300">Mappings</div>
                        {modalInputMappings.length === 0 && (
                          <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[11px] text-zinc-500">
                            No custom mappings yet. This node will receive the previous step output as <code>input</code>.
                          </div>
                        )}
                        {modalInputMappings.map((mapping, index) => (
                          <div
                            key={`${modalNode.id}_mapping_${index}`}
                            className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2"
                          >
                            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                              <div>
                                <label className="text-[11px] text-zinc-400">Source Path</label>
                                <Input
                                  value={mapping.sourcePath || ""}
                                  onChange={(event) =>
                                    updateModalInputMappingRow(index, { sourcePath: event.target.value })
                                  }
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    const droppedPath = event.dataTransfer.getData("text/studio-source-path")
                                    if (droppedPath) {
                                      updateModalInputMappingRow(index, { sourcePath: droppedPath })
                                    }
                                  }}
                                  placeholder="input.data.title"
                                  list="studio-mapping-source-options"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-400">Target Field</label>
                                <Input
                                  value={mapping.targetField || ""}
                                  onChange={(event) =>
                                    updateModalInputMappingRow(index, { targetField: event.target.value })
                                  }
                                  placeholder="title"
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-2 text-red-300"
                                onClick={() => removeModalInputMappingRow(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="grid gap-2 md:grid-cols-2 md:items-end">
                              <label className="text-xs text-zinc-300 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={mapping.required === true}
                                  onChange={(event) =>
                                    updateModalInputMappingRow(index, { required: event.target.checked })
                                  }
                                />
                                Required
                              </label>
                              <div>
                                <label className="text-[11px] text-zinc-400">Default Value</label>
                                <Input
                                  value={mapping.defaultValue ?? ""}
                                  onChange={(event) =>
                                    updateModalInputMappingRow(index, { defaultValue: event.target.value })
                                  }
                                  placeholder="fallback"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3 xl:sticky xl:top-0 self-start">
                        <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-zinc-300">Field Library</div>
                              <div className="text-[11px] text-zinc-500">
                                Drag from here into the editor, or click the action buttons on each field.
                              </div>
                            </div>
                            <Input
                              value={mappingSearch}
                              onChange={(event) => setMappingSearch(event.target.value)}
                              placeholder="Search fields..."
                              className="max-w-[170px]"
                            />
                          </div>
                          <div className="rounded-md border border-dashed border-cyan-400/35 px-2 py-1 text-[11px] text-cyan-200">
                            Type <code>{"{{"}</code> inside URL/body/template fields to get inline suggestions.
                          </div>
                          <div
                            className="rounded-md border border-dashed border-cyan-400/35 px-2 py-1 text-[11px] text-cyan-200"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              addModalInputMappingFromSourcePath(
                                event.dataTransfer.getData("text/studio-source-path")
                              )
                            }}
                          >
                            Drop a field here to create a new mapping row
                          </div>
                          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                            {mappingFieldCandidates.length === 0 && (
                              <div className="text-[11px] text-zinc-500">
                                {hasChatNode
                                  ? "Type a chat message or run the flow once to load field suggestions from real data."
                                  : "Add a webhook payload above or run the flow once to load field suggestions from real data."}
                              </div>
                            )}
                            {mappingFieldCandidates.map((candidate) => (
                              <div
                                key={`${candidate.sourceLabel}_${candidate.sourcePath}`}
                                className="space-y-2 rounded border border-white/10 bg-black/40 px-2 py-2"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData("text/studio-source-path", candidate.sourcePath)
                                }}
                              >
                                <div className="min-w-0">
                                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                                    {candidate.sourceLabel}
                                  </div>
                                  <div className="truncate font-mono text-[11px] text-zinc-100">
                                    {candidate.sourcePath}
                                  </div>
                                  <div className="truncate text-[11px] text-zinc-400">
                                    {candidate.preview}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() =>
                                      applyFieldCandidateToModalNode(candidate.sourcePath, "mapping")
                                    }
                                  >
                                    Add
                                  </Button>
                                  {modalNode.data.kind === "chat" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "chat_message_path")
                                        }
                                      >
                                        Message
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "chat_history_path")
                                        }
                                      >
                                        History
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "http" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "http_url")
                                        }
                                      >
                                        URL
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "http_body")
                                        }
                                      >
                                        Body
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "memory" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "memory_user_id")
                                        }
                                      >
                                        User
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "memory_query")
                                        }
                                      >
                                        Query
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "memory_content")
                                        }
                                      >
                                        Content
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "memory_context")
                                        }
                                      >
                                        Context
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "websocket" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "websocket_url")
                                        }
                                      >
                                        URL
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "websocket_message")
                                        }
                                      >
                                        Message
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "condition" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(
                                            candidate.sourcePath,
                                            "condition_left_path"
                                          )
                                        }
                                      >
                                        Left
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(
                                            candidate.sourcePath,
                                            "condition_right_value"
                                          )
                                        }
                                      >
                                        Right
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "loop" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() =>
                                        applyFieldCandidateToModalNode(candidate.sourcePath, "loop_list_path")
                                      }
                                    >
                                      List
                                    </Button>
                                  )}
                                  {modalNode.data.kind === "ai" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "ai_input_path")
                                        }
                                      >
                                        Input
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "ai_history_path")
                                        }
                                      >
                                        History
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(candidate.sourcePath, "ai_prompt")
                                        }
                                      >
                                        Prompt
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "orchestrator" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(
                                            candidate.sourcePath,
                                            "orchestrator_instruction_path"
                                          )
                                        }
                                      >
                                        Path
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(
                                            candidate.sourcePath,
                                            "orchestrator_history_path"
                                          )
                                        }
                                      >
                                        History
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          applyFieldCandidateToModalNode(
                                            candidate.sourcePath,
                                            "orchestrator_instruction"
                                          )
                                        }
                                      >
                                        Instruction
                                      </Button>
                                    </>
                                  )}
                                  {modalNode.data.kind === "output" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() =>
                                        applyFieldCandidateToModalNode(candidate.sourcePath, "output_template")
                                      }
                                    >
                                      Template
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <datalist id="studio-mapping-source-options">
                      {mappingPathOptions.slice(0, 120).map((path) => (
                        <option key={path} value={path} />
                      ))}
                    </datalist>
                  </div>
                )}

                <div className="rounded-md border border-white/10 bg-black/30 p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Node Test</div>
                  <p className="text-[11px] text-zinc-500">
                    {modalNode.data.kind === "webhook"
                      ? "Enter only the webhook body JSON here. Studio wraps it as trigger.body automatically and sends that body to the next node as input."
                      : modalNode.data.kind === "chat"
                        ? "Enter only the chat payload JSON here, for example { \"message\": \"hello\", \"history\": [] }. Studio wraps it as trigger.chat automatically and passes that chat object to the next node as input."
                      : "Enter sample input for this node. You can paste a plain JSON input object or the full { trigger, input, nodes } runtime payload. The current draft is applied and saved first so the test matches the modal editor."}
                  </p>
                  <textarea
                    value={nodeTestInput}
                    onChange={(event) => setNodeTestInput(event.target.value)}
                    className="w-full min-h-[140px] rounded-md border border-white/15 bg-black/40 p-2 font-mono text-xs text-zinc-100"
                  />
                  <Button
                    onClick={testModalNode}
                    disabled={!currentFlow || !modalNode || testingNode}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {testingNode ? "Testing..." : "Apply + Test Node"}
                  </Button>
                  {modalNodeTestError && (
                    <div className="rounded-md border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
                      {modalNodeTestError}
                    </div>
                  )}
                  <pre className="max-h-56 overflow-auto rounded-md border border-white/10 bg-black/50 p-3 text-xs text-emerald-200">
                    {nodeTestResult
                      ? JSON.stringify(nodeTestResult, null, 2)
                      : "Run a node test to inspect mapped input and node output..."}
                  </pre>
                </div>

                <div className="rounded-md border border-white/10 bg-black/30 p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-400">Advanced JSON Config</div>
                  <textarea
                    value={modalConfigDraft}
                    onChange={(event) => setModalConfigDraft(event.target.value)}
                    className="w-full min-h-[360px] rounded-md border border-white/15 bg-black/40 text-xs text-zinc-100 p-2 font-mono"
                  />
                  {modalConfigError && (
                    <div className="text-xs text-red-300">{modalConfigError}</div>
                  )}
                </div>
              </div>
              <DialogFooter className="px-5 py-4 border-t border-white/10 bg-black/20 gap-2">
                <Button
                  variant="outline"
                  onClick={() => duplicateNodeById(modalNode.id)}
                  className="gap-2"
                >
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  className="text-red-300 border-red-500/40 hover:bg-red-950/30"
                  onClick={() => {
                    deleteNodeById(modalNode.id)
                    setNodeConfigModalOpen(false)
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setNodeConfigModalOpen(false)}
                >
                  Close
                </Button>
                <Button onClick={applyModalNodeConfig}>Apply Changes</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
