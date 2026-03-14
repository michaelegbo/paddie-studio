export function createPlaceholderRun(flow, options) {
    const now = new Date().toISOString();
    const trace = flow.nodes.map((node) => ({
        id: `${flow.id}:${node.id}`,
        nodeId: node.id,
        status: "pending",
    }));
    return {
        id: `run_${Date.now()}`,
        flowId: flow.id,
        status: "pending",
        trigger: options.trigger,
        input: options.input,
        trace,
        createdAt: now,
    };
}
