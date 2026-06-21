import type { StepAction } from "./types/assistant";
import { getTool, getAllTools, type ToolContext, type ToolResult } from "./tools";

export interface ExecutorResult {
  success: boolean;
  stepResults: StepResult[];
  finalOutput?: string;
  error?: string;
}

export interface StepResult {
  step: StepAction;
  result: ToolResult;
}

/**
 * Execute a multi-step plan sequentially.
 * Performs ${var} substitution on step args from prior step `out` values.
 * Stops on the first error and returns partial results.
 */
export async function executePlan(
  steps: StepAction[],
  context?: Partial<ToolContext>,
): Promise<ExecutorResult> {
  const vars: Record<string, string> = { ...context?.vars };
  const stepResults: StepResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (context?.signal?.aborted) {
      return {
        success: false,
        stepResults,
        error: "Execution cancelled",
      };
    }

    const tool = getTool(step.tool);
    if (!tool) {
      const names = getAllTools().map((t) => t.name).join(", ");
      const errMsg = `Unknown tool: "${step.tool}". Available: ${names}`;
      stepResults.push({
        step,
        result: { success: false, error: errMsg },
      });
      return { success: false, stepResults, error: errMsg };
    }

    // Permission gate: reject sensitive native tools unless confirmed.
    // MCP tools handle their own confirmation through the bridge callback.
    // Computer tools also handle their own confirmation via getConfirmAction().
    if (!step.tool.startsWith("mcp_") && !step.tool.startsWith("computer_")) {
      const { classifyAction } = await import("./action-policy");
      if (classifyAction(step.tool) === "sensitive") {
        const errMsg = `Action "${step.tool}" is sensitive and requires explicit confirmation before execution.`;
        stepResults.push({
          step,
          result: { success: false, error: errMsg },
        });
        return { success: false, stepResults, error: errMsg };
      }
    }

    const resolvedArgs: Record<string, string> = {};
    for (const [key, value] of Object.entries(step.args)) {
      resolvedArgs[key] = resolvePlaceholders(value, vars);
    }

    let result: ToolResult;
    try {
      result = await tool.run(resolvedArgs, {
        vars,
        signal: context?.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = { success: false, error: msg };
    }

    stepResults.push({ step, result });

    if (!result.success) {
      return {
        success: false,
        stepResults,
        error: result.error || `Step ${i + 1} ("${step.tool}") failed`,
      };
    }

    if (step.out && result.data) {
      if (result.data[step.out]) {
        vars[step.out] = result.data[step.out];
      }
    }
  }

  const lastResult = stepResults[stepResults.length - 1];
  return {
    success: true,
    stepResults,
    finalOutput: lastResult?.result?.output,
  };
}

/**
 * Replace ${varName} placeholders in a string with values from the vars map.
 */
export function resolvePlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (name in vars) {
      return vars[name];
    }
    const placeholder = "${" + name + "}";
    return placeholder;
  });
}