<!--

 * @Author: xuranXYS
 * @LastEditTime: 2023-11-03 22:18:56
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# event.js文件  

ok，我们来分析event.js这个文件

```js
// ******************************** 回调管理器 ********************************

// 在移除场景对象的组件时，经常需要将操作推迟到栈尾
// 比如在遍历组件列表时调用了事件或脚本，将其中一个组件移除
// 就会影响到正在遍历的过程，从而产生意外
// 可以用Callback.push(fn)将要做的事情推迟到当前帧的栈尾执行
const Callback = new class {
  functions = []
  count = 0

  /**
   * 推送回调函数，稍后执行
   * @param {Function} fn 回调函数
   */
  push(fn) {
    this.functions[this.count++] = fn
  }

  /** 执行回调函数 */
  update() {
    for (let i = 0; i < this.count; i++) {
      this.functions[i]()
      this.functions[i] = null
    }
    this.count = 0
  }

  /** 重置回调堆栈 */
  reset() {
    for (let i = 0; i < this.count; i++) {
      this.functions[i] = null
    }
    this.count = 0
  }
}

```

可以看到作者的注释，解释的很明白，为啥他会在当前帧的栈尾执行  
还记得我们分析`main.js`的`update`方法吗  
当时没讲，现在我们讲一下  

```js  
/**
   * 更新游戏循环
   * @param {number} timestamp 增量时间(毫秒)
   */
  update(timestamp) {
    // 请求下一帧
    requestAnimationFrame(Game.update)

    // 更新时间
    Time.update(timestamp)

    // 防止Firefox隐藏时运行
    if (document.hidden) {
      return
    }

    // 如果正在同步加载数据
    // 渲染加载进度条并返回
    if (File.updateLoadingProgress()) {
      return File.renderLoadingProgress()
    }

    // 更新数据
    Game.updaters.update(Time.deltaTime)

    // 渲染图形
    Game.renderers.render()
  }

```  

首先是`requestAnimationFrame`请求下一帧，这个函数方法我没找到，应该是个内置的函数  
使用`Time.update`来计算时间  
其他的注释都很明白，最重要的其实就是`Game.updaters.update`这个  
它会调用我们之前创建的ModuleList里面所有对象的`update`方法来实现更新  
我们是在初始化的时候设置的更新器  

```js
// 设置更新器
    Game.updaters = new ModuleList(
      File,
      Input,
      Timer,
      Scene,
      EventManager,
      Trigger,
      UI,
      CacheList,
      Callback,
    )
```

是的，最后面就有我们的`Callback`对象，所以它就会实现在栈尾更新  
再往下看，是一个`EventManger`全局事件管理器  
看名字就知道它是管理事件的  

```js  

// ******************************** 全局事件管理器 ********************************

const EventManager = new class {
  // 管理器版本号(重置时更新)
  version = 0

  // 全局事件映射表(GUID->指令列表)
  guidMap = {}

  // 特殊事件映射表
  special = {}

  // 事件类型映射表(类型->事件列表)
  typeMap = {
    common: [],
    autorun: [],
    keydown: [],
    keyup: [],
    mousedown: [],
    mouseup: [],
    mousemove: [],
    doubleclick: [],
    wheel: [],
    gamepadbuttonpress: [],
    gamepadbuttonrelease: [],
    gamepadleftstickchange: [],
    gamepadrightstickchange: [],
    skilladd: [],
    skillremove: [],
    stateadd: [],
    stateremove: [],
    equipmentadd: [],
    equipmentremove: [],
    equipmentgain: [],
    itemgain: [],
    moneygain: [],
  }

  // 已激活事件列表
  activeEvents = []

```

其中的属性，`version`版本这个是个新概念，就是在当前的对象更改时候会修改这里的版本  
版本这个概念在你使用引擎的时候也会接触到，需要理解  
然后就是`guidMap`全局映射表和`special`特殊事件映射表  
全局映射表存储的是引擎工程内所有的脚本文件的信息  
特殊事件映射表存储的是引擎工程内所有的特殊事件文件的信息  
`activeEvents`是存储已激活事件列表的，我们知道事件是可以开关(是否启用)的  
  
ok，我们理解了事件管理器的属性之后，下面来看初始化事件  

```js
/** 初始化全局事件管理器 */
  initialize() {
    const {guidMap, typeMap} = this
    const events = Object.values(Data.events)

    // 删除数据释放内存
    delete Data.events

    // 编译事件指令
    for (const {id, path, enabled, priority, type, commands} of events) {
      commands.path = '@ ' + path
      const cmds = Command.compile(commands)
      let parent = typeMap[type]
      if (parent === undefined) {
        parent = typeMap[type] = []
      }
      cmds.default = enabled
      cmds.enabled = enabled
      cmds.priority = priority
      cmds.parent = parent
      parent.push(cmds)
      guidMap[id] = cmds
    }

    // 获取特殊事件
    this.special.startup = guidMap[Data.config.event.startup]
    this.special.loadGame = guidMap[Data.config.event.loadGame]
    this.special.initScene = guidMap[Data.config.event.initScene]
    this.special.showText = guidMap[Data.config.event.showText]
    this.special.showChoices = guidMap[Data.config.event.showChoices]

    // 侦听事件
    Scene.on('initialize', () => this.callSpecialEvent('initScene'))
    Scene.on('keydown', () => this.emit('keydown', false))
    Scene.on('keyup', () => this.emit('keyup', false))
    Scene.on('mousedown', () => this.emit('mousedown', false))
    Scene.on('mouseup', () => this.emit('mouseup', false))
    Scene.on('mousemove', () => this.emit('mousemove', false))
    Scene.on('doubleclick', () => this.emit('doubleclick', false))
    Scene.on('wheel', () => this.emit('wheel', false))
    Scene.on('gamepadbuttonpress', () => this.emit('gamepadbuttonpress', false))
    Scene.on('gamepadbuttonrelease', () => this.emit('gamepadbuttonrelease', false))
    Scene.on('gamepadleftstickchange', () => this.emit('gamepadleftstickchange', false))
    Scene.on('gamepadrightstickchange', () => this.emit('gamepadrightstickchange', false))
    Input.on('keydown', () => this.emit('keydown', true), true)
    Input.on('keyup', () => this.emit('keyup', true), true)
    Input.on('mousedown', () => this.emit('mousedown', true), true)
    Input.on('mouseup', () => this.emit('mouseup', true), true)
    Input.on('mousemove', () => this.emit('mousemove', true), true)
    Input.on('doubleclick', () => this.emit('doubleclick', true), true)
    Input.on('wheel', () => this.emit('wheel', true), true)
    Input.on('gamepadbuttonpress', () => this.emit('gamepadbuttonpress', true), true)
    Input.on('gamepadbuttonrelease', () => this.emit('gamepadbuttonrelease', true), true)
    Input.on('gamepadleftstickchange', () => this.emit('gamepadleftstickchange', true), true)
    Input.on('gamepadrightstickchange', () => this.emit('gamepadrightstickchange', true), true)
  }
```

可以看到是事件部分是从`Data`的`events`里面获取的数据，然后新建了`events`对象的副本，且把它删除了  
然后后面根据里面的数据编译了每个数据的初始对象，后面再获取初始对象和侦听事件  
  
再往下看  
```js
 /**
   * 获取指定ID的事件指令
   * @param {string} id 事件ID
   * @returns {Array<Function>}
   */
  get(id) {
    return this.guidMap[id]
  }

  /** 重置全局事件的开关状态 */
  reset() {
    for (const commands of Object.values(this.guidMap)) {
      commands.enabled = commands.default
    }
    this.version++
  }

  /** 调用特殊事件 */
  callSpecialEvent(type) {
    const commands = this.special[type]
    if (commands) {
      EventHandler.call(new EventHandler(commands))
    }
  }

  /** 调用自动执行事件 */
  callAutorunEvents() {
    for (const commands of this.typeMap.autorun) {
      EventHandler.call(new EventHandler(commands))
    }
  }

  /**
   * 调用全局事件
   * @param {string} id 全局事件文件ID
   * @returns {EventHandler|undefined}
   */
  call(id) {
    const commands = this.guidMap[id]
    if (commands) {
      const event = new EventHandler(commands)
      EventHandler.call(event, this.updaters)
      return event
    }
  }
```
上面的`reset`方法，首先遍历我们全部的事件值，将事件的开启状态设置为默认值  
`callSpecialEvent`和`callAutorunEvents`原理一样，获取对应的事件，然后使用call方法调用执行事件  
`call`方法也差不多，但唯一不同的就是它会返回创建的EventHandler  
  
  
再往下看  
```js

  /**
   * 发送全局事件
   * @param {string} type 全局事件类型
   * @param {boolean} priority 是不是优先事件
   * @param {Object} [options] 传递事件上下文属性
   */
  emit(type, priority = null, options) {
    for (const commands of this.typeMap[type] ?? []) {
      if (commands.enabled && (priority === null ||
        commands.priority === priority)) {
        const event = new EventHandler(commands)
        // 添加传递的数据到事件上下文
        if (options) Object.assign(event, options)
        // 设置事件优先级
        event.priority = commands.priority
        EventHandler.call(event)
        // 如果事件停止传递，跳出
        if (Input.bubbles.get() === false) {
          break
        }
      }
    }
  }

  /**
   * 添加已激活事件处理器
   * @param {EventHandler} event 事件处理器
   */
  append(event) {
    this.activeEvents.push(event)
    // 添加事件完成回调函数：延迟移除
    event.onFinish(() => {
      Callback.push(() => {
        this.activeEvents.remove(event)
      })
    })
  }

  /**
   * 更新管理器中的已激活事件处理器
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    if (Scene.paused === 0) {
      for (const event of this.activeEvents) {
        event.update(deltaTime)
      }
    } else {
      for (const event of this.activeEvents) {
        if (event.priority) {
          event.update(deltaTime)
        }
      }
    }
  }
```
`emit`方法遍历了类型事件（自动事件、普通事件、滚轮事件等），然后判断了之后设置是否添加上下文  
随后使用`call`方法执行事件，判断了`Input`类事件，如果禁止传递就跳出，相当于只执行当前的事件，后面的事件就不执行了  
`append`方法则是添加已激活的事件处理器，执行完成后使用`Callback`立即将事件从`activeEvents`中移出  
`update`方法判断了如果场景不是暂停状态的话，就调用`activeEvents`里面的事件的`update`方法（事件的`update`就是依次执行指令了）  
否则就执行有优先级的事件  

再往下看  
```js
/**
   * 启用全局事件(延迟)
   * @param {string} id 全局事件文件ID
   */
  enable(id) {
    const commands = this.guidMap[id]
    if (commands) {
      const {version} = this
      commands.callback = () => {
        if (this.version === version) {
          commands.enabled = true
        }
        commands.callback = null
      }
      Callback.push(() => {
        commands.callback?.()
      })
    }
  }

  /**
   * 禁用全局事件(立即)
   * @param {string} id 全局事件文件ID
   */
  disable(id) {
    const commands = this.guidMap[id]
    if (commands) {
      commands.enabled = false
      commands.callback = null
    }
  }

  /**
   * 设置全局事件为最高优先级
   * @param {string} id 全局事件文件ID
   */
  setToHighestPriority(id) {
    const commands = this.guidMap[id]
    if (commands) {
      // 延迟执行，将事件移动到头部
      Callback.push(() => {
        commands.priority = true
        const list = commands.parent
        const index = list.indexOf(commands)
        for (let i = index; i > 0; i--) {
          list[i] = list[i - 1]
        }
        list[0] = commands
      })
    }
  }
}

```
`enable`方法启用全局事件需要`Data`编译的全局事件和当前的版本号一样才可以启用，启用后将自身置空（防止重复调用）  
`setToHighestPriority`方法设置优先级，`Callback.push`里面`index`获取了当前事件在它`parent`（就是我们上面提到的类型事件）的位置  
然后依次将list[i]的值设置为它前一个的事件，这样就让事件全部往后移了一位，这样再设置0索引出的事件为当前事件就实现了事件的提前的效果  

再往下看，是脚本插件管理器  
```js

// ******************************** 插件管理器 ********************************

const PluginManager = new class {
  /** 初始化插件管理器 */
  initialize() {
    const {plugins} = Data
    // 删除初始化方法和插件数据
    delete this.initialize
    delete Data.plugins
    const manager = Script.create({}, plugins)
    // 获取脚本实例，以类名作为键进行注册
    for (const instance of manager.instances) {
      const {name} = instance.constructor
      if (name !== '') this[name] = instance
    }
    // 发送自动执行事件(onStart)
    manager.emit('autorun')
  }
}
// 正在执行的事件相关属性(全局)
let Event = {commands: [], index: 0}
let CommandList
let CommandIndex
```
初始化了一个`PluginManager`的类，`initialize`方法首先删除了自身和`Data.plugins`  
然后获取脚本实例，以类名作为键进行注册放进`PluginManager`类里面（名称为空则不注册），然后发送自动执行事件(onStart)  

