import EventEmitter from 'events'
import Module from 'module'

import debug from 'debug'
const logDebug = debug('watch-module:debug')
const logTrace = debug('watch-module:trace')

// -----------------
// Emitter
// -----------------
class ModuleWatcher extends EventEmitter {
  constructor(private readonly _filter: LoadedModuleFilter) {
    super()
  }

  public get filter(): LoadedModuleFilter {
    return this._filter
  }

  private _matchesFilter(info: LoadedModuleInfo) {
    if (info.isCoreModule && this._filter.coreModules) return true
    if (info.isNodeModule && this._filter.nodeModules) return true
    return this._filter.userModules
  }

  static registeredWatchers: Set<ModuleWatcher> = new Set()

  static onModuleLoaded(loadedModule: LoadedModuleInfo) {
    if (logTrace.enabled) {
      logTrace('Loaded %s', prettyPrint(loadedModule))
    }
    for (const watcher of this.registeredWatchers) {
      debugger
      if (watcher._matchesFilter(loadedModule)) {
        watcher.emit('match', loadedModule)
      }
    }
  }
}

// -----------------
// Module._load override
// -----------------

// NOTE: we need to watch out here for conflicting modules that also patch
// Module._load also when it comes to restoring it

// @ts-ignore
const origLoad = Module._load

function moduleLoad(
  moduleUri: string,
  parent: NodeModule | undefined,
  isMain: boolean
) {
  const parentUri = parent?.id ?? '<root>'
  const isCoreModule = isCore(moduleUri)
  const isNodeModule = !isCoreModule && isNodeMod(moduleUri)
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
export function addWatcher(partialFilter: Partial<LoadedModuleFilter> = {}) {
  const filter = Object.assign(
    { coreModules: false, nodeModules: false, userModules: true },
    partialFilter
  )
  maybeOverride()
  verifyFilter(filter)

  logDebug('Adding watcher with %o', filter)
  const moduleWatcher = new ModuleWatcher(filter)
  ModuleWatcher.registeredWatchers.add(moduleWatcher)
  logDebug('Total watchers: %d', ModuleWatcher.registeredWatchers.size)

  return moduleWatcher
}

export function removeWatcher(moduleWatcher: ModuleWatcher) {
  logDebug('Trying to delete watcher with %o', moduleWatcher.filter)
  const found = ModuleWatcher.registeredWatchers.delete(moduleWatcher)
  logDebug(
    'Watcher was %s. Total watchers: %d',
    found ? 'found and deleted' : 'not found',
    ModuleWatcher.registeredWatchers.size
  )
  maybeRestore()
  return found
}

export function watcherStats() {
  return { watchers: ModuleWatcher.registeredWatchers.size }
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

// -----------------
// Helpers
// -----------------
function prettyPrint(loadedModule: LoadedModuleInfo) {
  const ty = loadedModule.isCoreModule
    ? 'core module'
    : loadedModule.isNodeModule
    ? 'node module'
    : 'user module'
  return `${ty}: '${loadedModule.moduleUri}' from '${loadedModule.parentUri}'`
}
