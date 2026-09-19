import type { CapabilityManifest } from './types.js';

export interface RegisteredCapability<T = unknown> {
  manifest: CapabilityManifest;
  implementation: T;
}

export class CapabilityRegistry {
  readonly #capabilities = new Map<string, RegisteredCapability>();

  register<T>(capability: RegisteredCapability<T>): this {
    if (this.#capabilities.has(capability.manifest.id)) throw new Error(`Capability already registered: ${capability.manifest.id}`);
    this.#capabilities.set(capability.manifest.id, capability);
    return this;
  }

  get<T = unknown>(id: string): RegisteredCapability<T> {
    const capability = this.#capabilities.get(id);
    if (!capability) throw new Error(`Unknown capability: ${id}`);
    return capability as RegisteredCapability<T>;
  }

  list(): CapabilityManifest[] {
    return [...this.#capabilities.values()].map(({ manifest }) => structuredClone(manifest));
  }
}
