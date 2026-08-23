import type { ToolDefinition, ToolRegistry, ToolPermission } from "./types";

class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(definition.id)) {
      console.warn(`Tool ${definition.id} already registered, overwriting`);
    }
    this.tools.set(definition.id, definition as ToolDefinition<unknown, unknown>);
  }

  get(id: string): ToolDefinition<unknown, unknown> | undefined {
    return this.tools.get(id);
  }

  getAll(): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  getByPermission(permission: string): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values()).filter((tool) =>
      tool.requiredPermissions.includes(permission as ToolPermission)
    );
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }
}

export const toolRegistry = new ToolRegistryImpl();

export function registerTool<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
  toolRegistry.register(definition);
}

export function getTool<TInput, TOutput>(id: string): ToolDefinition<TInput, TOutput> | undefined {
  return toolRegistry.get(id) as ToolDefinition<TInput, TOutput> | undefined;
}

export function getAllTools(): ToolDefinition<unknown, unknown>[] {
  return toolRegistry.getAll();
}

export function getToolsByPermission(permission: string): ToolDefinition<unknown, unknown>[] {
  return toolRegistry.getByPermission(permission);
}

export function hasTool(id: string): boolean {
  return toolRegistry.has(id);
}