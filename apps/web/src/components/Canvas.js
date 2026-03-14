import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Canvas({ flow }) {
    return (_jsx("div", { className: "canvas", children: flow.nodes.map((node, index) => (_jsxs("div", { className: "canvas-node", style: { top: 48 + (index % 3) * 128, left: 40 + index * 160 }, children: [_jsx("div", { style: { fontSize: 12, color: "#9B9DB3", textTransform: "uppercase" }, children: node.type }), _jsx("strong", { children: node.label })] }, node.id))) }));
}
