import EventEmitter from 'events'
import Module from 'module'
import { strict as assert } from 'assert'

import debug from 'debug'
const logDebug = debug('watch-module:debug')
const logTrace = debug('watch-module:trace')

const DEFAULT_MODULE_WATCHER_CONFIG = { restore: false }

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
      if (watcher._matchesFilter(loadedModule)) {
        watcher.emit('match', loadedModule)
      }
    }
  }

  static config: ModuleWatcherConfig = DEFAULT_MODULE_WATCHER_CONFIG
}

// -----------------
// Module._load override
// -----------------

// NOTE: we need to watch out here for conflicting modules that also patch
// Module._load

// @ts-ignore
let origLoad: Function | undefined

function moduleLoad(
  moduleUri: string,
  parent: NodeModule | undefined,
  isMain: boolean
) {
  const parentUri = parent?.id ?? '<root>'
  const isCoreModule = isCore(moduleUri)
  const isNodeModule = isNodeMod(isCoreModule, moduleUri, parentUri)
  ModuleWatcher.onModuleLoaded({
    moduleUri,
    parentUri,
    isCoreModule,
    isNodeModule,
  })

  assert(
    origLoad != null,
    'origLoad should have been set during Module._load override'
  )
  return origLoad.apply(Module, [moduleUri, parent, isMain])
}

function maybeOverride() {
  if (origLoad == null) {
    // @ts-ignore
    origLoad = Module._load
    // @ts-ignore
    Module._load = moduleLoad
  }
}

function maybeRestore() {
  if (
    ModuleWatcher.config.restore &&
    ModuleWatcher.registeredWatchers.size === 0
  ) {
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

export function configure(config: ModuleWatcherConfig) {
  ModuleWatcher.config = config
}

/**
 * Resets global state of {@link ModuleWatcher} as well as [Module._load].
 * Only call this when testing.
 */
export function _reset() {
  if (origLoad != null) {
    // @ts-ignore
    Module._load = origLoad
    origLoad = undefined
  }
  ModuleWatcher.registeredWatchers.clear()
  ModuleWatcher.config = DEFAULT_MODULE_WATCHER_CONFIG
}

function verifyFilter(filter: LoadedModuleFilter) {
  if (!filter.coreModules && !filter.nodeModules && !filter.userModules) {
    throw new Error(
      `Invalid filter ${filter}, at least one prop needs to be true`
    )
  }
}

export type ModuleWatcherConfig = {
  restore: boolean
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
const USER_MODULE_RX = /^[./\\]/
function isNodeMod(isCoreModule: boolean, uri: string, _parentUri: string) {
  if (isCoreModule) return false

  // easycase, `node_modules/` is in uri
  const inNodeModulePath = NODE_MODULE_RX.test(uri)
  if (inNodeModulePath) return true

  // trickier case, i.e. `require('foreach')` has no `node_modules/` in path
  // but is clearly not a user module either
  const isUserModule = USER_MODULE_RX.test(uri)
  if (!isUserModule) return true

  // TODO(thlorenz): node_modules requiring relative modules (detect via parentUri)
  return false
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
