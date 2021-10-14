import {
  addWatcher,
  configure,
  LoadedModuleInfo,
  removeWatcher,
  watcherStats,
  _reset,
} from '../src/watch-module'
import test from 'tape'
import spok from 'spok'
import Module from 'module'

function clearRequireCache() {
  for (const key of Object.keys(require.cache)) {
    delete require.cache[key]
  }
}

test('adding and removing watchers with default config', (t) => {
  _reset()
  // @ts-ignore
  const origLoad = Module._load

  // @ts-ignore
  t.equal(Module._load, origLoad, 'Module._load unchanged')

  const watcher1 = addWatcher()
  spok(
    t,
    watcherStats(),
    { watchers: 1 },
    'after adding one watcher we have one'
  )
  // @ts-ignore
  t.notEqual(Module._load, origLoad, 'Module._load overridden')
  const watcher2 = addWatcher()
  spok(
    t,
    watcherStats(),
    { watchers: 2 },
    'after adding another watcher we have two'
  )

  const removedSecond = removeWatcher(watcher2)
  t.ok(removedSecond, 'watcher 2 successfully removed')
  spok(t, watcherStats(), { watchers: 1 })

  // @ts-ignore
  t.notEqual(Module._load, origLoad, 'Module._load overridden')

  const removedSecondAgain = removeWatcher(watcher2)
  t.notOk(removedSecondAgain, 'watcher 2 can only be removed once')
  spok(t, watcherStats(), { watchers: 1 })

  const removedFirst = removeWatcher(watcher1)
  t.ok(removedFirst, 'watcher 1 successfully removed')
  spok(t, watcherStats(), { watchers: 0 })

  // @ts-ignore
  t.notEqual(Module._load, origLoad, 'Module._load not restored')

  t.end()
})

test('adding and removing watchers with config = { restore: true }', (t) => {
  _reset()
  // @ts-ignore
  const origLoad = Module._load
  configure({ restore: true })

  // @ts-ignore
  t.equal(Module._load, origLoad, 'Module._load unchanged')

  const watcher1 = addWatcher()
  spok(
    t,
    watcherStats(),
    { watchers: 1 },
    'after adding one watcher we have one'
  )
  // @ts-ignore
  t.notEqual(Module._load, origLoad, 'Module._load overridden')

  const removedFirst = removeWatcher(watcher1)
  t.ok(removedFirst, 'watcher 1 successfully removed')
  spok(t, watcherStats(), { watchers: 0 })

  // @ts-ignore
  t.equal(Module._load, origLoad, 'Module._load restored')

  t.end()
})

test('watching core modules only', (t) => {
  _reset()
  clearRequireCache()

  const watcher = addWatcher({ coreModules: true, userModules: false })
  let requiredModule: LoadedModuleInfo | null = null
  watcher.on('match', (match) => {
    requiredModule = match
  })

  t.comment('+++ requiring user module +++')
  require('./fixtures/local-module')
  t.equal(requiredModule, null, 'does not emit watched module')

  t.comment('+++ requiring node module +++')
  // a node_module that doesn't require any core modules
  require('foreach')
  t.equal(requiredModule, null, 'does not emit watched module')

  t.comment('+++ requiring core module fs +++')
  require('fs')
  t.ok(requiredModule != null, 'emits a module match')
  if (requiredModule != null) {
    spok(t, <LoadedModuleInfo>requiredModule, {
      $topic: 'requiredModule',
      isCoreModule: true,
      isNodeModule: false,
      moduleUri: 'fs',
    })
  }
  t.end()
})

test('watching node modules only, requiring one directly', (t) => {
  _reset()
  clearRequireCache()

  const watcher = addWatcher({ nodeModules: true, userModules: false })
  let requiredModule: LoadedModuleInfo | null = null
  watcher.on('match', (match) => {
    requiredModule = match
  })

  t.comment('+++ requiring user module +++')
  require('./fixtures/local-module')

  t.comment('+++ requiring core module fs +++')
  require('fs')
  t.equal(requiredModule, null, 'does not emit watched module')

  t.comment('+++ requiring node module +++')
  // a node_module that doesn't require any core modules
  require('foreach')
  t.ok(requiredModule != null, 'emits a module match')
  if (requiredModule != null) {
    spok(t, <LoadedModuleInfo>requiredModule, {
      $topic: 'requiredModule',
      isCoreModule: false,
      isNodeModule: true,
      moduleUri: 'foreach',
    })
  }
  t.end()
})

test('watching node modules only, requiring one that requires another one', (t) => {
  _reset()
  clearRequireCache()

  const watcher = addWatcher({ nodeModules: true, userModules: false })
  let requiredModules: LoadedModuleInfo[] = []
  watcher.on('match', (match) => {
    requiredModules.push(match)
  })

  t.comment('+++ requiring parent node module +++')
  // a node_module that doesn't require any core modules
  require('has-symbols')

  spok(
    t,
    requiredModules,
    Object.assign(
      [
        {
          moduleUri: 'has-symbols',
          isCoreModule: false,
          isNodeModule: true,
        },
        {
          moduleUri: './shams',
          isCoreModule: false,
          isNodeModule: true,
        },
      ],
      { $topic: 'requiredModules' }
    )
  )
  t.end()
})

test('watching user modules only', (t) => {
  _reset()
  clearRequireCache()

  const watcher = addWatcher({ userModules: true })
  let requiredModule: LoadedModuleInfo | null = null
  watcher.on('match', (match) => {
    requiredModule = match
  })

  t.comment('+++ requiring core module fs +++')
  require('fs')
  t.equal(requiredModule, null, 'does not emit watched module')

  t.comment('+++ requiring node module +++')
  // a node_module that doesn't require any core modules
  require('foreach')
  t.equal(requiredModule, null, 'does not emit watched module')

  t.comment('+++ requiring user module +++')
  require('./fixtures/local-module')
  t.ok(requiredModule != null, 'emits a module match')
  if (requiredModule != null) {
    spok(t, <LoadedModuleInfo>requiredModule, {
      $topic: 'requiredModule',
      isCoreModule: false,
      isNodeModule: false,
      moduleUri: './fixtures/local-module',
    })
  }
  t.end()
})

test('watching user modules only with one watcher and user modules + node_modules with another', (t) => {
  _reset()
  clearRequireCache()

  const userModulesOnly = addWatcher({ userModules: true })
  const userModulesAndNodeModules = addWatcher({
    nodeModules: true,
    userModules: true,
  })

  const requiredUserModulesOnly: LoadedModuleInfo[] = []
  const requiredUserModulesAndNodeModules: LoadedModuleInfo[] = []

  userModulesOnly.on('match', (match) => {
    requiredUserModulesOnly.push(match)
  })
  userModulesAndNodeModules.on('match', (match) => {
    requiredUserModulesAndNodeModules.push(match)
  })

  t.comment('+++ requiring core module fs +++')
  require('fs')

  t.comment('+++ requiring node module +++')
  require('foreach')

  t.comment('+++ requiring user module +++')
  require('./fixtures/local-module')

  spok(
    t,
    requiredUserModulesOnly,
    Object.assign(
      [
        {
          moduleUri: './fixtures/local-module',
          isCoreModule: false,
          isNodeModule: false,
        },
      ],
      { $topic: 'requiredUserModulesOnly' }
    )
  )
  spok(
    t,
    requiredUserModulesAndNodeModules,
    Object.assign(
      [
        {
          moduleUri: 'foreach',
          isCoreModule: false,
          isNodeModule: true,
        },
        {
          moduleUri: './fixtures/local-module',
          isCoreModule: false,
          isNodeModule: false,
        },
      ],
      { $topic: 'requiredUserModulesAndNodeModules' }
    )
  )
  t.end()
})
