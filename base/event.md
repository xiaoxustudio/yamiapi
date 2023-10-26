<!--

 * @Author: xuranXYS
 * @LastEditTime: 2023-10-09 18:03:52
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

可以看到是事件部分是从`Data`的`events`里面获取的  

