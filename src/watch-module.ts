import EventEmitter from 'events'
import Module from 'module'

// -----------------
// Emitter
// -----------------
class ModuleWatcher extends EventEmitter {
  constructor(private readonly _filter: LoadedModuleFilter) {
    super()
  }

  private _matchesFilter(info: LoadedModuleInfo) {
    if (info.isCoreModule && !this._filter.coreModules) return false
    if (info.isNodeModule && !this._filter.nodeModules) return false
    return this._filter.userModules
  }

  static registeredWatchers: Set<ModuleWatcher> = new Set()

  static onModuleLoaded(nodeModule: LoadedModuleInfo) {
    for (const watcher of this.registeredWatchers) {
      if (watcher._matchesFilter(nodeModule)) {
        watcher.emit('match', nodeModule)
      }
    }
  }
}

// -----------------
// Module._load override
// -----------------
// @ts-ignore
const origLoad = Module._load

function moduleLoad(
  moduleUri: string,
  parent: NodeModule | undefined,
  isMain: boolean
) {
  const parentUri = parent?.id ?? '<root>'
  const isCoreModule = isCore(moduleUri)
  const isNodeModule = isNodeMod(moduleUri)
  ModuleWatcher.onModuleLoaded({
    moduleUri,
    parentUri,
    isCoreModule,
    isNodeModule,
  })
  return origLoad.apply(Module, [moduleUri, parent, isMain])
}

function maybeOverride() {
  // @ts-ignore
  if (Module._load != moduleLoad) {
    // @ts-ignore
    Module._load = moduleLoad
  }
}

function maybeRestore() {
  if (ModuleWatcher.registeredWatchers.size === 0) {
    // @ts-ignore
    Module._load = origLoad
  }
}

// -----------------
// API
// -----------------
export function addWatcher(filter: LoadedModuleFilter) {
  maybeOverride()
  verifyFilter(filter)
  const moduleWatcher = new ModuleWatcher(filter)
  ModuleWatcher.registeredWatchers.add(moduleWatcher)
  return moduleWatcher
}

export function removeWatcher(moduleWatcher: ModuleWatcher) {
  const found = ModuleWatcher.registeredWatchers.delete(moduleWatcher)
  maybeRestore()
  return found
}

function verifyFilter(filter: LoadedModuleFilter) {
  if (!filter.coreModules && !filter.nodeModules && !filter.userModules) {
    throw new Error(
      `Invalid filter ${filter}, at least one prop needs to be true`
    )
  }
}

export type LoadedModuleInfo = {
  moduleUri: string
  parentUri: string
  isCoreModule: boolean
  isNodeModule: boolean
}

export type LoadedModuleFilter = {
  coreModules: boolean
  nodeModules: boolean
  userModules: boolean
}

// -----------------
// Matchers
// -----------------
const coreModules = new Set(Module.builtinModules)
function isCore(uri: string) {
  return coreModules.has(uri)
}

const NODE_MODULE_RX = /node_modules\/.+/
function isNodeMod(uri: string) {
  return NODE_MODULE_RX.test(uri)
}
