'use strict'

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

// ******************************** 事件处理器类 ********************************

class EventHandler {
  complete    //:boolean
  commands    //:array
  index       //:number
  stack       //:array
  attributes  //:object
  timer       //:object

  /**
   * 事件处理器
   * @param {function[]} commands 事件指令列表
   */
  constructor(commands) {
    this.complete = false
    this.commands = commands
    this.index = 0
    this.stack = new CommandStack()
    this.attributes = {}
  }

  /**
   * 执行事件指令
   * @returns {boolean} 事件已完成状态
   */
  update() {
    // 设置相关属性到全局变量
    Event = this
    CommandList = this.commands
    CommandIndex = this.index
    // 连续执行指令，直到返回false(中断)
    while (CommandList[CommandIndex++]()) {}
    // 取回全局变量中的事件属性
    this.commands = CommandList
    this.index = CommandIndex
    // 返回事件完成状态
    return this.complete
  }

  /**
   * 获取事件计时器(计时器会替换update方法，用于事件指令异步等待)
   * @returns {{set: function, continue: function}} 事件计时器
   */
  getTimer() {
    let timer = this.timer
    if (timer === undefined) {
      // 事件首次等待按需创建计时器
      let duration = 0
      const update = this.update
      const tick = deltaTime => {
        return (duration -= deltaTime) <= 0
        ? (this.update = update, this.update())
        : false
      }
      // 在闭包中创建计时器
      timer = this.timer = {
        set: waitingTime => {
          duration = waitingTime
          // 设置更新函数为：计时
          this.update = tick
        },
        continue: () => {
          // 恢复更新函数
          this.update = update
        },
        get duration() {
          return duration
        },
        set duration(value) {
          duration = value
        },
      }
    }
    return timer
  }

  /**
   * 事件等待指定时间
   * @param {number} duration 等待时间(毫秒)
   * @returns {false} 中断指令的执行
   */
  wait(duration) {
    this.getTimer().set(duration)
    return false
  }

  /**
   * 暂停执行事件
   * @returns {false} 中断指令的执行
   */
  pause() {
    this.getTimer()
    // 设置更新函数为：等待
    this.update = EventHandler.wait
    return false
  }

  /** 继续执行事件 */
  continue() {
    this.timer.continue()
  }

  /** 调用事件结束回调函数 */
  finish() {
    this.complete = true
    // 执行结束回调
    if (this.callbacks !== undefined) {
      for (const callback of this.callbacks) {
        callback()
      }
    }
  }

  /**
   * 设置事件结束回调
   * @param {function} callback 回调函数
   */
  onFinish(callback) {
    if (this.complete) {
      callback()
    } else {
      // 添加回调函数到队列中
      if (this.callbacks !== undefined) {
        this.callbacks.push(callback)
      } else {
        this.callbacks = [callback]
      }
    }
  }

  // 继承事件上下文
  inheritEventContext(event) {
    this.attributes = event.attributes
    if ('priority' in event) {
      this.priority = event.priority
    }
    for (const key of EventHandler.inheritedKeys) {
      // 继承事件上下文属性
      if (key in event) {
        this[key] = event[key]
      }
    }
  }

  /**
   * 返回等待状态(暂停事件方法)
   * @returns {function}
   */
  static wait = () => false

  /**
   * 调用事件
   * @param {EventHandler} event 事件处理器
   * @param {ModuleList} updaters 更新器列表
   * @returns {EventHandler} 传入的事件处理器
   */
  static call = (event, updaters) => {
    this.save()
    // 如果事件更新后发生了等待
    if (event.update() === false) {
      if (updaters !== undefined) {
        // 如果指定了更新器列表，延迟将未执行完的事件放入
        Callback.push(() => {
          updaters.append(event)
        })
        // 设置事件结束时回调函数：延迟从更新器中移除
        event.onFinish(() => {
          Callback.push(() => {
            updaters.remove(event)
          })
        })
      } else {
        // 如果未指定更新器列表，添加到事件管理器中
        Callback.push(() => {
          EventManager.append(event)
        })
      }
    }
    this.restore()
    return event
  }

  // 事件栈
  static stacks = []

  // 事件栈索引
  static index = 0

  /** 保存正在执行的事件状态 */
  static save() {
    this.stacks[this.index++] = Event
    Event.commands = CommandList
    Event.index = CommandIndex
  }

  /** 恢复事件状态 */
  static restore() {
    Event = this.stacks[--this.index]
    CommandList = Event.commands
    CommandIndex = Event.index
  }

  // 继承事件上下文的属性键
  static inheritedKeys = [
    'triggerActor',
    'casterActor',
    'triggerSkill',
    'triggerState',
    'triggerEquipment',
    'triggerItem',
    'triggerObject',
    'triggerLight',
    'triggerRegion',
    'triggerElement',
  ]
}

// ******************************** 脚本管理器类 ********************************

class Script {
  parent    //:object
  instances //:array

  /**
   * 脚本管理器
   * @param {Object} owner 脚本宿主对象
   */
  constructor(owner) {
    this.parent = owner
    this.instances = []
  }

  /**
   * 添加脚本对象
   * @param {Object} instance 脚本对象
   */
  add(instance) {
    // 以脚本类名作为键进行注册
    const name = instance.constructor.name
    if (name !== '') this[name] = instance
    // 如果实现了update方法，则添加到父级更新器列表
    if (typeof instance.update === 'function') {
      this.parent.updaters?.push(instance)
    }
    instance.onScriptAdd?.(this.parent)
    this.instances.push(instance)
  }

  /**
   * 移除脚本对象(未使用)
   * @param {Object} instance 脚本对象
   */
  remove(instance) {
    const name = instance.constructor.name
    if (this[name] === instance) delete this[name]
    if (typeof instance.update === 'function') {
      this.parent.updaters?.remove(instance)
    }
    instance.onScriptRemove?.(this.parent)
    this.instances.remove(instance)
  }

  /**
   * 调用脚本方法
   * @param {string} method 方法名称
   * @param  {...any} parameters 传递参数
   */
  call(method, ...parameters) {
    for (const instance of this.instances) {
      instance[method]?.(...parameters)
    }
  }

  /**
   * 发送脚本事件
   * @param {string} type 事件类型
   * @param {any} parameter 传递参数
   */
  emit(type, parameter) {
    // 将事件类型映射到脚本事件方法名称
    const method = Script.eventTypeMap[type]
    // 调用每个脚本对象的事件方法，并传递参数
    for (const instance of this.instances) {
      instance[method]?.(parameter)
    }
  }

  // 延迟加载函数参数开关
  // 速度比调用闭包函数快一点
  static deferredLoading = false
  static deferredCount = 0
  static deferredInstances = []
  static deferredKeys = []
  static deferredValues = []

  /**
   * 放入延迟获取的脚本参数
   * 等待场景对象和UI元素创建完毕后再获取
   * @param {Object} instance 脚本对象
   * @param {string} key 
   * @param {function} value 
   */
  static pushDeferredParameter(instance, key, value) {
    Script.deferredInstances[Script.deferredCount] = instance
    Script.deferredKeys[Script.deferredCount] = key
    Script.deferredValues[Script.deferredCount] = value
    Script.deferredCount++
  }

  /** 加载延迟参数到脚本对象中 */
  static loadDeferredParameters() {
    for (let i = 0; i < Script.deferredCount; i++) {
      Script.deferredInstances[i][Script.deferredKeys[i]] = Script.deferredValues[i]()
      Script.deferredInstances[i] = null
      Script.deferredValues[i] = null
    }
    Script.deferredCount = 0
    Script.deferredLoading = false
  }

  /**
   * 创建脚本管理器(使用脚本数据)
   * @param {Object} owner 脚本宿主对象
   * @param {Object[]} data 脚本数据列表
   * @returns {Script}
   */
  static create(owner, data) {
    const manager = new Script(owner)
    // 如果脚本列表不为空
    if (data.length > 0) {
      for (const wrap of data) {
        // 如果脚本已禁用，跳过
        if (wrap.enabled === false) continue
        // 初始化以及重构参数列表(丢弃无效参数)
        if (wrap.initialized === undefined) {
          wrap.initialized = true
          wrap.parameters = Script.compileParamList(wrap.id, wrap.parameters)
        }
        const {id, parameters} = wrap
        const script = Data.scripts[id]
        // 如果不存在脚本，发送警告
        if (script === undefined) {
          const meta = Data.manifest.guidMap[id]
          const name = meta?.path ?? `#${id}`
          console.error(new Error(`The script is missing: ${name}`), owner)
          continue
        }
        // 创建脚本对象实例，并传递脚本参数
        const instance = new script.constructor(owner)
        const length = parameters.length
        for (let i = 0; i < length; i += 2) {
          const key = parameters[i]
          let value = parameters[i + 1]
          if (typeof value === 'function') {
            if (Script.deferredLoading) {
              // 如果值类型是函数，且开启了延时加载参数开关
              Script.pushDeferredParameter(instance, key, value)
              continue
            }
            value = value()
          }
          instance[key] = value
        }
        manager.add(instance)
      }
    }
    return manager
  }

  /**
   * 编译脚本参数列表
   * @param {string} id 脚本文件ID
   * @param {Object[]} parameters 脚本参数数据列表
   * @returns {Array} 编译后的脚本参数列表
   */
  static compileParamList(id, parameters) {
    const script = Data.scripts[id]
    // 如果不存在脚本，返回空列表
    if (script === undefined) {
      return Array.empty
    }
    const defParameters = script.parameters
    const length = defParameters.length
    // 如果不存在参数，返回空列表
    if (length === 0) {
      return Array.empty
    }
    // 创建扁平化的参数列表
    const parameterList = new Array(length * 2)
    for (let i = 0; i < length; i++) {
      const defParameter = defParameters[i]
      const {key, type} = defParameter
      let value = parameters[key]
      // 根据默认参数类型，对实参进行有效性检查
      // 如果实参是无效的，则使用默认值
      switch (type) {
        case 'boolean':
        case 'number':
          if (typeof value !== type) {
            value = defParameter.value
          }
          break
        case 'variable-number':
          if (typeof value !== 'number') {
            if (value?.getter === 'variable') {
              value = Command.compileVariable(value, Attribute.NUMBER_GET)
            } else {
              value = () => undefined
            }
          }
          break
        case 'option':
          if (!defParameter.options.includes(value)) {
            value = defParameter.value
          }
          break
        case 'number[]':
        case 'string[]':
          if (Array.isArray(value)) {} else {
            value = defParameter.value
          }
          break
        case 'attribute':
          value = Attribute.get(value)
          break
        case 'attribute-key':
          value = Attribute.getKey(value)
          break
        case 'enum':
          value = Enum.get(value)
          break
        case 'enum-value':
          value = Enum.getValue(value)
          break
        case 'actor': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'region': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'light': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'animation': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'particle': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'parallax': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'tilemap': {
          const id = value
          value = () => Scene.idMap[id]
          break
        }
        case 'element': {
          const id = value
          value = () => UI.idMap[id]
          break
        }
        case 'keycode':
          if (typeof value !== 'string') {
            value = defParameter.value
          }
          break
        case 'variable-getter':
          if (value?.getter === 'variable') {
            value = {
              get: Command.compileVariable(value, Attribute.GET),
              set: Command.compileVariable(value, Attribute.SAFE_SET),
            }
          } else {
            value = () => undefined
          }
          break
        case 'actor-getter':
          if (value?.getter === 'actor') {
            value = Command.compileActor(value)
          } else {
            value = () => undefined
          }
          break
        case 'skill-getter':
          if (value?.getter === 'skill') {
            value = Command.compileSkill(value)
          } else {
            value = () => undefined
          }
          break
        case 'state-getter':
          if (value?.getter === 'state') {
            value = Command.compileState(value)
          } else {
            value = () => undefined
          }
          break
        case 'equipment-getter':
          if (value?.getter === 'equipment') {
            value = Command.compileEquipment(value)
          } else {
            value = () => undefined
          }
          break
        case 'item-getter':
          if (value?.getter === 'item') {
            value = Command.compileItem(value)
          } else {
            value = () => undefined
          }
          break
        case 'element-getter':
          if (value?.getter === 'element') {
            value = Command.compileElement(value)
          } else {
            value = () => undefined
          }
          break
        case 'position-getter':
          if (value?.getter === 'position') {
            const getPoint = Command.compilePosition(value)
            value = () => {
              const point = getPoint()
              return point ? {x: point.x, y: point.y} : undefined
            }
          } else {
            value = () => undefined
          }
          break
        default:
          if (typeof value !== 'string') {
            value = defParameter.value
          }
          break
      }
      const pi = i * 2
      parameterList[pi] = key
      parameterList[pi + 1] = value
    }
    return parameterList
  }

  // 事件类型映射表(事件类型->脚本方法名称)
  static eventTypeMap = {
    update: 'update',
    create: 'onCreate',
    autorun: 'onStart',
    collision: 'onCollision',
    hittrigger: 'onHitTrigger',
    hitactor: 'onHitActor',
    destroy: 'onDestroy',
    playerenter: 'onPlayerEnter',
    playerleave: 'onPlayerLeave',
    actorenter: 'onActorEnter',
    actorleave: 'onActorLeave',
    skillcast: 'onSkillCast',
    skilladd: 'onSkillAdd',
    skillremove: 'onSkillRemove',
    stateadd: 'onStateAdd',
    stateremove: 'onStateRemove',
    equipmentadd: 'onEquipmentAdd',
    equipmentremove: 'onEquipmentRemove',
    itemuse: 'onItemUse',
    keydown: 'onKeyDown',
    keyup: 'onKeyUp',
    mousedown: 'onMouseDown',
    mousedownLB: 'onMouseDownLB',
    mousedownRB: 'onMouseDownRB',
    mouseup: 'onMouseUp',
    mouseupLB: 'onMouseUpLB',
    mouseupRB: 'onMouseUpRB',
    mousemove: 'onMouseMove',
    mouseenter: 'onMouseEnter',
    mouseleave: 'onMouseLeave',
    click: 'onClick',
    doubleclick: 'onDoubleClick',
    wheel: 'onWheel',
    input: 'onInput',
    focus: 'onFocus',
    blur: 'onBlur',
    destroy: 'onDestroy',
  }
}