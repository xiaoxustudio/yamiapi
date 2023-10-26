'use strict'

// ******************************** 运行时指令栈类 ********************************

class CommandStack extends Array {
  index = 0

  /**
   * 推入事件指令的执行状态
   * @param {Function[]} commands 事件指令列表
   * @param {number} index 事件指令索引
   */
  push(commands, index) {
    this[this.index] = commands
    this[this.index + 1] = index
    this.index += 2
  }

  /**
   * 弹出事件指令的执行状态
   * @returns {Array<Function[], number> | null} 事件指令状态包装器
   */
  pop() {
    if (this.index !== 0) {
      CommandStack.wrap[0] = this[this.index -= 2]
      CommandStack.wrap[1] = this[this.index + 1]
      return CommandStack.wrap
    }
    return null
  }

  // 数据包装[指令列表, 索引]
  static wrap = new Array(2)
}

// ******************************** 编译时指令栈类 ********************************

class CompileTimeCommandStack extends Array {
  /** 获取上一次入栈的指令上下文 */
  get() {return this[this.length - 1]}
}

// ******************************** 指令编译器 ********************************

const Command = new class {
  // 编译时指令栈
  stack = new CompileTimeCommandStack()

  // 编译时标签上下文集合
  labels = null

  // 编译时跳转上下文集合
  jumps = null

  // 自定义指令脚本映射表
  scriptMap = {}

  // 参数正则表达式映射表
  paramRegExpMap = {}

  // 参数字符串
  parameters = ''

  // 显示文本指令内容
  textContent = ''

  // 显示选项进入分支
  choiceIndex = -1

  // 显示选项内容列表
  choiceContents = []
}

/** 初始化指令编译器 */
Command.initialize = function () {
  const {commands} = Data
  delete this.initialize
  delete Data.commands
  const parameters = {}
  // 给自定义指令添加空的参数表
  for (const command of commands) {
    command.parameters = parameters
  }
  // 创建自定义指令的脚本管理器
  const manager = Script.create({}, commands)
  // 获取脚本实例，以GUID作为键进行注册
  for (const instance of manager.instances) {
    const {guid} = instance.constructor
    this.scriptMap[guid] = instance
  }
  // 发送自动执行事件
  manager.emit('autorun')
}

/**
 * 编译指令
 * @param {Object[]} commands 指令数据列表
 * @param {Function} [callback] 指令执行完毕时回调函数
 * @param {boolean} loop 当前指令列表是否处于循环状态
 * @returns {Function[]} 编译后的事件指令函数列表
 */
Command.compile = function (commands, callback, loop = false) {
  const stack = this.stack
  const functions = []
  const context = {
    commands: functions,
    index: 0,
    loop: loop,
  }
  // 创建标签集合与跳转列表
  if (stack.length === 0) {
    context.path = commands.path
    this.labels = {}
    this.jumps = []
  }
  stack.push(context)
  const length = commands.length
  for (let i = 0; i < length; i++) {
    const command = commands[i]
    // 如果指令是函数，添加并跳过
    if (typeof command === 'function') {
      functions[context.index++] = command
      continue
    }
    const id = command.id
    // 跳过禁用的事件指令
    if (id[0] === '!') continue
    // 编译内置和自定义指令
    const fn = id in this
    ? this[id](command.params)
    : this.compileScript(command)
    // 跳过无效编译函数
    if (fn === null) continue
    if (typeof fn === 'function') {
      functions[context.index++] = fn
      continue
    }
    for (const cmdfn of fn) {
      functions[context.index++] = cmdfn
    }
  }
  // 添加栈尾回调函数
  functions.push(callback ?? Command.readStack)
  stack.pop()
  // 编译跳转
  if (stack.length === 0) {
    Command.compileJumps()
  }
  // 返回编译后的函数列表
  return functions
}

/**
 * 编译自定义指令脚本
 * @param {Object} command 事件指令数据
 * @param {string} command.id 事件指令ID
 * @param {Object} command.params 事件指令参数
 * @returns {Function}
 */
Command.compileScript = function ({id, params}) {
  let fn = Command.skip
  return () => {
    const script = this.scriptMap[id]
    if (typeof script?.call === 'function') {
      // 如果指令脚本拥有call方法，则编译参数列表，替换指令函数
      const parameters = Script.compileParamList(id, params)
      const length = parameters.length
      if (length === 0) {
        fn = () => (script.call() ?? true)
      } else {
        fn = () => {
          for (let i = 0; i < length; i += 2) {
            let value = parameters[i + 1]
            if (typeof value === 'function') {
              value = value()
            }
            script[parameters[i]] = value
          }
          return script.call() ?? true
        }
      }
    }
    // 编译时不能确定脚本已加载，因此使用运行时编译
    return (CommandList[CommandIndex - 1] = fn)()
  }
}

/** 编译跳转(后处理) */
Command.compileJumps = function () {
  const {labels, jumps} = this
  for (const {operation, label, commands, index} of jumps) {
    const context = labels[label]
    if (context) {
      const jump = Command.goto(
        context.commands,
        context.index,
      )
      let fn
      switch (operation) {
        case 'jump':
          fn = jump
          break
        case 'save-jump':
          fn = () => {
            Event.savedCommands = CommandList
            Event.savedIndex = CommandIndex
            return jump()
          }
          break
      }
      // 替换指令占位函数
      commands[index] = fn
    }
  }
  this.labels = null
  this.jumps = null
}

/**
 * 编译数值
 * @param {number|VariableGetter} number 数值或变量访问器
 * @param {number} [defValue] 默认值
 * @param {number} [min] 最小值
 * @param {number} [max] 最大值
 * @returns {Function}
 */
Command.compileNumber = function (number, defValue, min, max) {
  switch (typeof number) {
    case 'number':
      return () => number
    case 'object': {
      const getNumber = Command.compileVariable(number, Attribute.NUMBER_GET)
      if (defValue === undefined) defValue = 0
      return max === undefined
      ? () => getNumber() ?? defValue
      : () => Math.clamp(getNumber() ?? defValue, min, max)
    }
  }
}

/**
 * 编译字符串
 * @param {string|VariableGetter} string 字符串或变量访问器
 * @param {string} [defValue] 默认值
 * @returns {Function}
 */
Command.compileString = function (string, defValue) {
  switch (typeof string) {
    case 'string':
      return () => string
    case 'object': {
      const getString = Command.compileVariable(string, Attribute.GET)
      if (defValue === undefined) defValue = ''
      return () => {
        const value = getString()
        switch (typeof value) {
          case 'string':
            return value
          case 'number':
          case 'boolean':
            return value.toString()
          default:
            return defValue
        }
      }
    }
  }
}

/**
 * 编译枚举值
 * @param {string|VariableGetter} enumId 枚举值ID或变量访问器
 * @returns {Function}
 */
Command.compileEnumValue = function (enumId) {
  switch (typeof enumId) {
    case 'string': {
      const enumString = Enum.getValue(enumId)
      return () => enumString
    }
    case 'object': {
      const getString = Command.compileVariable(enumId, Attribute.STRING_GET)
      return () => getString() ?? ''
    }
  }
}

/** 编译变量对象 */
Command.compileVariable = function compileVariable(IIFE) {
  const set = new Set()
  const A = Attribute
  set.add(A.GET)
  set.add(A.DELETE)
  set.add(A.BOOLEAN_GET)
  set.add(A.NUMBER_GET)
  set.add(A.STRING_GET)
  set.add(A.ACTOR_GET)
  set.add(A.SKILL_GET)
  set.add(A.STATE_GET)
  set.add(A.EQUIPMENT_GET)
  set.add(A.ITEM_GET)
  set.add(A.TRIGGER_GET)
  set.add(A.LIGHT_GET)
  set.add(A.ELEMENT_GET)
  set.add(A.OBJECT_GET)
  set.add(A.LIST_GET)
  const compilers = {
    actor: actor => Command.compileActor(actor),
    skill: skill => Command.compileSkill(skill),
    state: state => Command.compileState(state),
    equipment: equipment => Command.compileEquipment(equipment),
    item: item => Command.compileItem(item),
    element: element => Command.compileElement(element),
  }
  /**
   * 编译变量对象
   * @param {VariableGetter} variable 变量访问器
   * @param {Function} operation 变量操作
   * @returns {Function}
   */
  return function (variable, operation) {
    const novalue = set.has(operation)
    const {key, type} = variable
    switch (type) {
      case 'local':
        return novalue
        ? ()    => operation(Event.attributes, key)
        : value => operation(Event.attributes, key, value)
      case 'global':
        return novalue
        ? ()    => operation(Variable.map, key)
        : value => operation(Variable.map, key, value)
      case 'self':
        return novalue
        ? ()    => Event.selfVarId && operation(SelfVariable.map, Event.selfVarId)
        : value => Event.selfVarId && operation(SelfVariable.map, Event.selfVarId, value)
      case 'actor':
      case 'skill':
      case 'state':
      case 'equipment':
      case 'item':
      case 'element':
        switch (typeof key) {
          case 'string': {
            const getter = compilers[type](variable[type])
            const attrKey = Attribute.get(key)?.key
            if (!attrKey) return Function.empty
            if (novalue) return () => {
              const target = getter()
              if (target) {
                return operation(target.attributes, attrKey)
              }
            }
            return value => {
              const target = getter()
              if (target) {
                return operation(target.attributes, attrKey, value)
              }
            }
          }
          case 'object': {
            const getter = compilers[type](variable[type])
            const getString = Command.compileString(key)
            if (novalue) return () => {
              const target = getter()
              const attrKey = getString()
              if (target && attrKey) {
                return operation(target.attributes, attrKey)
              }
            }
            return value => {
              const target = getter()
              const attrKey = getString()
              if (target && attrKey) {
                return operation(target.attributes, attrKey, value)
              }
            }
          }
        }
    }
  }
}()

/**
 * 编译角色对象
 * @param {ActorGetter} actor 角色访问器
 * @returns {Function}
 */
Command.compileActor = function (actor) {
  switch (actor.type) {
    case 'trigger':
      return () => Event.triggerActor
    case 'caster':
      return () => Event.casterActor
    case 'latest':
      return () => Actor.latest
    case 'target':
      return () => Event.targetActor
    case 'player':
      return () => Party.player
    case 'member': {
      const getMemberId = Command.compileNumber(actor.memberId)
      return () => Party.members[getMemberId()]
    }
    case 'global': {
      const {actorId} = actor
      return () => ActorManager.get(actorId)
    }
    case 'by-id': {
      const {presetId} = actor
      return () => {
        return Scene.idMap[presetId]
      }
    }
    case 'variable':
      return Command.compileVariable(actor.variable, Attribute.ACTOR_GET)
  }
}

/**
 * 编译技能对象
 * @param {SkillGetter} skill 技能访问器
 * @returns {Function}
 */
Command.compileSkill = function (skill) {
  switch (skill.type) {
    case 'trigger':
      return () => Event.triggerSkill
    case 'latest':
      return () => Skill.latest
    case 'by-key': {
      const getActor = Command.compileActor(skill.actor)
      const getShortcutKey = Command.compileEnumValue(skill.key)
      return () => getActor()?.shortcutManager.getSkill(getShortcutKey())
    }
    case 'by-id': {
      const getActor = Command.compileActor(skill.actor)
      return () => getActor()?.skillManager.get(skill.skillId)
    }
    case 'variable':
      return Command.compileVariable(skill.variable, Attribute.SKILL_GET)
  }
}

/**
 * 编译状态对象
 * @param {StateGetter} state 状态访问器
 * @returns {Function}
 */
Command.compileState = function (state) {
  switch (state.type) {
    case 'trigger':
      return () => Event.triggerState
    case 'latest':
      return () => State.latest
    case 'by-id': {
      const getActor = Command.compileActor(state.actor)
      return () => getActor()?.stateManager.get(state.stateId)
    }
    case 'variable':
      return Command.compileVariable(state.variable, Attribute.STATE_GET)
  }
}

/**
 * 编译装备对象
 * @param {EquipmentGetter} equipment 装备访问器
 * @returns {Function}
 */
Command.compileEquipment = function (equipment) {
  switch (equipment.type) {
    case 'trigger':
      return () => Event.triggerEquipment
    case 'latest':
      return () => Equipment.latest
    case 'by-slot': {
      const getActor = Command.compileActor(equipment.actor)
      const getSlot = Command.compileEnumValue(equipment.slot)
      return () => {
        return getActor()?.equipmentManager.get(getSlot())
      }
    }
    case 'by-id-equipped': {
      const getActor = Command.compileActor(equipment.actor)
      return () => getActor()?.equipmentManager.getById(equipment.equipmentId)
    }
    case 'by-id-inventory': {
      const getActor = Command.compileActor(equipment.actor)
      return () => {
        const goods = getActor()?.inventory.get(equipment.equipmentId)
        return goods instanceof Equipment ? goods : undefined
      }
    }
    case 'variable':
      return Command.compileVariable(equipment.variable, Attribute.EQUIPMENT_GET)
  }
}

/**
 * 编译物品对象
 * @param {ItemGetter} item 物品访问器
 * @returns {Function}
 */
Command.compileItem = function (item) {
  switch (item.type) {
    case 'trigger':
      return () => Event.triggerItem
    case 'latest':
      return () => Item.latest
    case 'by-key': {
      const getActor = Command.compileActor(item.actor)
      const getShortcutKey = Command.compileEnumValue(item.key)
      return () => getActor()?.shortcutManager.getItem(getShortcutKey())
    }
    case 'by-id': {
      const getActor = Command.compileActor(item.actor)
      return () => {
        const goods = getActor()?.inventory.get(item.itemId)
        return goods instanceof Item ? goods : undefined
      }
    }
    case 'variable':
      return Command.compileVariable(item.variable, Attribute.ITEM_GET)
  }
}

/** 编译场景位置对象 */
Command.compilePosition = function compilePosition() {
  const sharedPoints = [
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0},
  ]
  let index = -1
  const length = sharedPoints.length
  const getSharedPoint = () => {
    return sharedPoints[index = ++index % length]
  }
  /**
   * 编译场景位置对象
   * @param {PositionGetter} position 场景位置访问器
   * @returns {Function}
   */
  return function (position) {
    switch (position.type) {
      case 'absolute': {
        const getX = Command.compileNumber(position.x)
        const getY = Command.compileNumber(position.y)
        return () => {
          const sharedPoint = getSharedPoint()
          sharedPoint.x = getX()
          sharedPoint.y = getY()
          return sharedPoint
        }
      }
      case 'relative': {
        const getX = Command.compileNumber(position.x)
        const getY = Command.compileNumber(position.y)
        return reference => {
          if (reference) {
            const sharedPoint = getSharedPoint()
            sharedPoint.x = reference.x + getX()
            sharedPoint.y = reference.y + getY()
            return sharedPoint
          }
        }
      }
      case 'actor':
        return Command.compileActor(position.actor)
      case 'trigger':
        return Command.compileTrigger(position.trigger)
      case 'light':
        return Command.compileLight(position.light)
      case 'region': {
        const getRegion = Command.compileRegion(position.region)
        switch (position.mode) {
          case 'center':
            return getRegion
          case 'random':
            return () => getRegion()?.getRandomPosition()
          case 'random-land':
            return () => getRegion()?.getRandomPosition(0)
          case 'random-water':
            return () => getRegion()?.getRandomPosition(1)
          case 'random-wall':
            return () => getRegion()?.getRandomPosition(2)
        }
      }
      case 'object': {
        const {objectId} = position
        return () => Scene.idMap[objectId]
      }
      case 'mouse':
        return () => {
          const sharedPoint = getSharedPoint()
          sharedPoint.x = Input.mouse.sceneX
          sharedPoint.y = Input.mouse.sceneY
          return sharedPoint
        }
    }
  }
}()

/**
 * 编译角度对象
 * @param {AngleGetter} angle 角度访问器
 * @returns {Function} 弧度
 */
Command.compileAngle = function (angle) {
  switch (angle.type) {
    case 'position': {
      const getPoint = Command.compilePosition(angle.position)
      return origin => {
        const point = getPoint()
        if (point) {
          const distY = point.y - origin.y
          const distX = point.x - origin.x
          return Math.atan2(distY, distX)
        }
        return origin.angle ?? 0
      }
    }
    case 'absolute': {
      const getDegrees = Command.compileNumber(angle.degrees)
      return () => Math.radians(getDegrees())
    }
    case 'relative': {
      const getDegrees = Command.compileNumber(angle.degrees)
      return origin => (origin.angle ?? 0) + Math.radians(getDegrees())
    }
    case 'direction': {
      const radians = Math.radians(angle.degrees)
      return origin => {
        const animation = origin.animation
        if (animation) {
          return animation.getDirectionAngle() + radians
        }
        return radians
      }
    }
    case 'random': {
      const radians = Math.PI * 2
      return () => Math.random() * radians
    }
  }
}

/**
 * 编译触发器对象
 * @param {TriggerGetter} trigger 触发器访问器
 * @returns {Function}
 */
Command.compileTrigger = function (trigger) {
  switch (trigger.type) {
    case 'trigger':
      return () => Event.triggerObject
    case 'latest':
      return () => Trigger.latest
    case 'variable':
      return Command.compileVariable(trigger.variable, Attribute.TRIGGER_GET)
  }
}

/**
 * 编译光源对象
 * @param {LightGetter} light 光源访问器
 * @returns {Function}
 */
Command.compileLight = function (light) {
  switch (light.type) {
    case 'trigger':
      return () => Event.triggerLight
    case 'latest':
      return () => SceneLight.latest
    case 'by-id': {
      const {presetId} = light
      return () => {
        return Scene.idMap[presetId]
      }
    }
    case 'variable':
      return Command.compileVariable(light.variable, Attribute.LIGHT_GET)
  }
}

/**
 * 编译区域对象
 * @param {RegionGetter} region 区域访问器
 * @returns {Function}
 */
Command.compileRegion = function (region) {
  switch (region.type) {
    case 'trigger':
      return () => Event.triggerRegion
    case 'by-id': {
      const {presetId} = region
      return () => {
        return Scene.idMap[presetId]
      }
    }
  }
}

/**
 * 编译瓦片地图对象
 * @param {TilemapGetter} tilemap 瓦片地图访问器
 * @returns {Function}
 */
Command.compileTilemap = function (tilemap) {
  switch (tilemap.type) {
    case 'trigger':
      return () => Event.triggerTilemap
    case 'by-id': {
      const {presetId} = tilemap
      return () => {
        return Scene.idMap[presetId]
      }
    }
  }
}

/**
 * 编译元素对象
 * @param {ElementGetter} element 元素访问器
 * @returns {Function}
 */
Command.compileElement = function (element) {
  switch (element.type) {
    case 'trigger':
      return () => Event.triggerElement
    case 'latest':
      return () => UI.latest
    case 'by-id': {
      const {presetId} = element
      return () => {
        return UI.get(presetId)
      }
    }
    case 'by-index': {
      const getParent = Command.compileElement(element.parent)
      const getIndex = Command.compileNumber(element.index, -1)
      return () => getParent()?.children[getIndex()]
    }
    case 'by-ancestor-and-id': {
      const {ancestor, presetId} = element
      const getAncestor = Command.compileElement(ancestor)
      return () => getAncestor()?.query('presetId', presetId)
    }
    case 'by-button-index': {
      const getFocus = Command.compileElement(element.focus)
      const getIndex = Command.compileNumber(element.index, -1)
      return () => {
        const focus = getFocus()
        return focus instanceof UIElement
        ? UI.getFocusedButtons(focus, true)[getIndex()]
        : undefined
      }
    }
    case 'selected-button': {
      const getFocus = Command.compileElement(element.focus)
      return () => UI.getSelectedButton(getFocus())
    }
    case 'focus':
      return () => UI.getFocus()
    case 'parent': {
      const getElement = Command.compileVariable(element.variable, Attribute.ELEMENT_GET)
      return () => getElement()?.parent ?? undefined
    }
    case 'variable':
      return Command.compileVariable(element.variable, Attribute.ELEMENT_GET)
  }
}

/**
 * 编译函数
 * @param {string} script 函数返回值脚本
 * @returns {Function}
 */
Command.compileFunction = function (script) {
  try {
    return new Function(`return ${script}`)
  } catch (error) {
    return Function.empty
  }
}

/**
 * 从参数字符串中获取指定类型的值
 * @param {string} key 参数名称
 * @param {string} type 参数类型
 * @returns {boolean|number|string|undefined}
 */
Command.getParameter = function (key, type) {
  if (!key) return undefined
  let regexp = this.paramRegExpMap[key]
  if (regexp === undefined) {
    regexp = new RegExp(`(?:^|,)\\s*${key}(?:\\s*:\\s*(.*?))?\\s*(?:$|,)`)
    this.paramRegExpMap[key] = regexp
  }
  const match = Command.parameters.match(regexp)
  if (match) {
    switch (type) {
      case 'boolean':
        switch (match[1]) {
          case undefined:
          case 'true':
            return true
          case 'false':
            return false
        }
        return undefined
      case 'number': {
        const string = match[1]
        if (string) {
          const number = parseFloat(string)
          if (!isNaN(number)) return number
        }
        return undefined
      }
      case 'string':
        return match[1]
    }
  }
}

/** 编译条件列表 */
Command.compileConditions = function compileConditions(IIFE) {
  const {GET, BOOLEAN_GET, NUMBER_GET, STRING_GET, OBJECT_GET, LIST_GET} = Attribute

  // 编译布尔操作数
  const compileBooleanOperand = operand => {
    switch (operand.type) {
      case 'none':
        return () => undefined
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable':
        return Command.compileVariable(operand.variable, BOOLEAN_GET)
    }
  }

  // 编译数值操作数
  const compileNumberOperand = operand => {
    switch (operand.type) {
      case 'none':
        return () => undefined
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable':
        return Command.compileVariable(operand.variable, NUMBER_GET)
    }
  }

  // 编译字符串操作数
  const compileStringOperand = operand => {
    switch (operand.type) {
      case 'none':
        return () => undefined
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable':
        return Command.compileVariable(operand.variable, STRING_GET)
      case 'enum': {
        const string = Enum.getValue(operand.stringId)
        return () => string
      }
    }
  }

  // 编译对象操作数
  const compileObjectOperand = operand => {
    switch (operand.type) {
      case 'none':
        return () => undefined
      case 'actor':
        return Command.compileActor(operand.actor)
      case 'skill':
        return Command.compileSkill(operand.skill)
      case 'state':
        return Command.compileState(operand.state)
      case 'equipment':
        return Command.compileEquipment(operand.equipment)
      case 'item':
        return Command.compileItem(operand.item)
      case 'trigger':
        return Command.compileTrigger(operand.trigger)
      case 'light':
        return Command.compileLight(operand.light)
      case 'element':
        return Command.compileElement(operand.element)
      case 'variable':
        return Command.compileVariable(operand.variable, OBJECT_GET)
    }
  }

  // 编译条件
  const compileCondition = condition => {
    switch (condition.type) {
      case 'boolean': {
        const {variable, operation, operand} = condition
        const a = Command.compileVariable(variable, BOOLEAN_GET)
        const b = compileBooleanOperand(operand)
        switch (operation) {
          case 'equal':
            return () => a() === b()
          case 'unequal':
            return () => a() !== b()
        }
      }
      case 'number': {
        const {variable, operation, operand} = condition
        const a = Command.compileVariable(variable, NUMBER_GET)
        const b = compileNumberOperand(operand)
        switch (operation) {
          case 'equal':
            return () => a() === b()
          case 'unequal':
            return () => a() !== b()
          case 'greater-or-equal':
            return () => a() >= b()
          case 'less-or-equal':
            return () => a() <= b()
          case 'greater':
            return () => a() > b()
          case 'less':
            return () => a() < b()
        }
      }
      case 'string': {
        const {variable, operation, operand} = condition
        const a = Command.compileVariable(variable, STRING_GET)
        const b = compileStringOperand(operand)
        switch (operation) {
          case 'equal':
            return () => a() === b()
          case 'unequal':
            return () => a() !== b()
          case 'include':
            return () => a()?.indexOf(b()) > -1
          case 'exclude':
            return () => a()?.indexOf(b()) === -1
        }
      }
      case 'object': {
        const {variable, operation, operand} = condition
        const a = Command.compileVariable(variable, OBJECT_GET)
        switch (operation) {
          case 'equal': {
            const b = compileObjectOperand(operand)
            return () => a() === b()
          }
          case 'unequal': {
            const b = compileObjectOperand(operand)
            return () => a() !== b()
          }
          case 'is-actor':
            return () => a() instanceof Actor
          case 'is-skill':
            return () => a() instanceof Skill
          case 'is-state':
            return () => a() instanceof State
          case 'is-equipment':
            return () => a() instanceof Equipment
          case 'is-item':
            return () => a() instanceof Item
          case 'is-trigger':
            return () => a() instanceof Trigger
          case 'is-light':
            return () => a() instanceof SceneLight
          case 'is-element':
            return () => a() instanceof UIElement
        }
      }
      case 'actor': {
        const {actor, operation} = condition
        const getActor = Command.compileActor(actor)
        switch (operation) {
          case 'present-active':
            return () => {
              const actor = getActor()
              return actor ? Scene.actors === actor.parent && actor.active : false
            }
          case 'present':
            return () => Scene.actors === getActor()?.parent
          case 'absent':
            return () => Scene.actors !== getActor()?.parent
          case 'active':
            return () => {
              const actor = getActor()
              return actor ? actor.active : false
            }
          case 'inactive':
            return () => {
              const actor = getActor()
              return actor ? !actor.active : false
            }
          case 'has-targets':
            return () => getActor()?.targetManager.targets.length > 0
          case 'has-no-targets':
            return () => getActor()?.targetManager.targets.length === 0
          case 'in-screen':
            return () => {
              const actor = getActor()
              if (actor) {
                return (
                  actor.x >= Camera.scrollLeftT &&
                  actor.x < Camera.scrollRightT &&
                  actor.y >= Camera.scrollTopT &&
                  actor.y < Camera.scrollBottomT
                )
              }
            }
          case 'is-player':
            return () => Party.player === getActor()
          case 'is-member':
            return () => Party.members.includes(getActor())
          case 'has-skill': {
            const {skillId} = condition
            return () => !!getActor()?.skillManager.get(skillId)
          }
          case 'has-state': {
            const {stateId} = condition
            return () => !!getActor()?.stateManager.get(stateId)
          }
          case 'has-items': {
            const {itemId, quantity} = condition
            return () => getActor()?.inventory.count(itemId) >= quantity
          }
          case 'has-equipments': {
            const {equipmentId, quantity} = condition
            return () => getActor()?.inventory.count(equipmentId) >= quantity
          }
          case 'has-skill-shortcut': {
            const getKey = Command.compileEnumValue(condition.shortcutKey)
            return () => getActor()?.shortcutManager.get(getKey())?.type === 'skill'
          }
          case 'has-item-shortcut': {
            const getKey = Command.compileEnumValue(condition.shortcutKey)
            return () => getActor()?.shortcutManager.get(getKey())?.type === 'item'
          }
          case 'equipped': {
            const {equipmentId} = condition
            return () => !!getActor()?.equipmentManager.getById(equipmentId)
          }
          case 'is-teammate': {
            const getTarget = Command.compileActor(condition.target)
            return () => {
              const actor = getActor()
              const target = getTarget()
              return !!actor && !!target && actor.teamId === target.teamId
            }
          }
          case 'is-friend': {
            const getTarget = Command.compileActor(condition.target)
            return () => Team.isFriendly(getActor()?.teamId, getTarget()?.teamId)
          }
          case 'is-enemy': {
            const getTarget = Command.compileActor(condition.target)
            return () => Team.isEnemy(getActor()?.teamId, getTarget()?.teamId)
          }
          case 'is-team-member':
            return () => getActor()?.teamId === condition.teamId
          case 'is-team-friend':
            return () => Team.isFriendly(getActor()?.teamId, condition.teamId)
          case 'is-team-enemy':
            return () => Team.isEnemy(getActor()?.teamId, condition.teamId)
        }
      }
      case 'element': {
        const {element, operation} = condition
        const getElement = Command.compileElement(element)
        switch (operation) {
          case 'present':
            return () => getElement()?.connected === true
          case 'absent':
            return () => getElement()?.connected !== true
          case 'visible':
            return () => getElement()?.isVisible() === true
          case 'invisible':
            return () => getElement()?.isVisible() === false
          case 'is-focus':
            return () => UI.focuses.includes(getElement())
          case 'dialogbox-is-paused':
          case 'dialogbox-is-updating':
          case 'dialogbox-is-waiting':
          case 'dialogbox-is-complete': {
            const index = operation.lastIndexOf('-')
            const state = operation.slice(index + 1)
            return () => {
              const element = getElement()
              if (element instanceof DialogBoxElement) {
                return element.state === state
              }
              return true
            }
          }
        }
      }
      case 'keyboard': {
        const {keycode, state} = condition
        const {keys} = Input
        switch (state) {
          case 'pressed':
            return () => keys[keycode] === 1
          case 'released':
            return () => keys[keycode] !== 1
        }
      }
      case 'gamepad': {
        const {button, state} = condition
        const {buttons} = Controller
        switch (state) {
          case 'pressed':
            return () => buttons[button] === true
          case 'released':
            return () => buttons[button] === false
        }
      }
      case 'mouse': {
        const {button, state} = condition
        const {buttons} = Input
        switch (state) {
          case 'pressed':
            return () => buttons[button] === 1
          case 'released':
            return () => buttons[button] === 0
        }
      }
      case 'list': {
        const {list, operation, target} = condition
        const getList = Command.compileVariable(list, LIST_GET)
        const getTarget = Command.compileVariable(target, GET)
        switch (operation) {
          case 'include':
            return () => {
              const list = getList()
              const target = getTarget()
              return list && target !== undefined && list.includes(target)
            }
          case 'exclude':
            return () => {
              const list = getList()
              const target = getTarget()
              return list && target !== undefined && !list.includes(target)
            }
        }
      }
      case 'other':
        switch (condition.key) {
          case 'mouse-entered':
            return () => Input.mouse.entered
          case 'mouse-left':
            return () => !Input.mouse.entered
          case 'game-is-paused':
            return () => Scene.paused !== 0
          case 'game-is-not-paused':
            return () => Scene.paused === 0
          case 'scene-input-is-prevented':
            return () => Scene.preventInputEvents !== 0
          case 'scene-input-is-not-prevented':
            return () => Scene.preventInputEvents === 0
        }
    }
  }

  /** 编译条件列表
   * @param {string} mode 满足所有条件|满足任意条件
   * @param {Object[]} conditions 条件数据列表
   * @returns {Function} 是否达成条件
   */
  return (mode, conditions) => {
    const length = conditions.length
    if (length === 1) {
      return compileCondition(conditions[0])
    }
    const testers = new Array(length)
    for (let i = 0; i < length; i++) {
      testers[i] = compileCondition(conditions[i])
    }
    switch (mode) {
      case 'all':
        if (length < 6) {
          const [a, b, c, d, e] = testers
          switch (length) {
            case 2: return () => a() && b()
            case 3: return () => a() && b() && c()
            case 4: return () => a() && b() && c() && d()
            case 5: return () => a() && b() && c() && d() && e()
          }
        }
        return () => {
          for (let i = 0; i < length; i++) {
            if (testers[i]() === false) {
              return false
            }
          }
          return true
        }
      case 'any':
        if (length < 6) {
          const [a, b, c, d, e] = testers
          switch (length) {
            case 2: return () => a() || b()
            case 3: return () => a() || b() || c()
            case 4: return () => a() || b() || c() || d()
            case 5: return () => a() || b() || c() || d() || e()
          }
        }
        return () => {
          for (let i = 0; i < length; i++) {
            if (testers[i]() === true) {
              return true
            }
          }
          return false
        }
    }
  }
}()

/**
 * 编译文本内容
 * @param {string} content 需要解析插入变量的文本内容
 * @returns {Function}
 */
Command.compileTextContent = function compileTextContent(content) {
  if (typeof content === 'object') {
    return Command.compileString(content)
  }
  // 获取变量标签正则表达式
  let {regexp} = compileTextContent
  if (!regexp) {
    regexp = compileTextContent.regexp = /<(local):(.*?)>|<(global):([0-9a-f]{16})>/g
  }
  const slices = []
  const setters = []
  let li = 0
  let match
  while (match = regexp.exec(content)) {
    const mi = match.index
    if (mi > li) {
      slices.push(content.slice(li, mi))
    }
    const index = slices.length
    const scope = match[1] ?? match[3]
    const key = match[2] ?? match[4]
    let getter
    switch (scope) {
      case 'local':
        getter = () => Event.attributes[key]
        break
      case 'global':
        getter = () => Variable.get(key)
        break
    }
    const setter = () => slices[index] = getter()
    setters.push(setter)
    slices.push('')
    li = regexp.lastIndex
  }
  // 无匹配标签的情况
  if (li === 0) {
    const fn = () => content
    fn.constant = true
    return fn
  }
  // 找到标签的情况
  if (content.length > li) {
    slices.push(content.slice(li))
  }
  return () => {
    for (const setter of setters) {
      setter()
    }
    return slices.join('')
  }
}

/**
 * 读取指令栈
 * @returns {boolean} 指令栈中是否有可用的指令
 */
Command.readStack = () => {
  const wrap = Event.stack.pop()
  if (wrap === null) {
    Event.finish()
    return false
  }
  CommandList = wrap[0]
  CommandIndex = wrap[1]
  return true
}

/**
 * 跳过指令
 * @returns {true}
 */
Command.skip = () => true

/**
 * 编译跳转函数
 * @param {Object[]} commands 编译后的指令函数列表
 * @param {number} index 跳转到列表中的索引位置
 * @returns {Function} true代表继续执行
 */
Command.goto = function (commands, index) {
  // 跳转到头部
  if (index === 0) {
    return () => {
      CommandList = commands
      CommandIndex = 0
      return true
    }
  }
  // 跳转到索引(通用)
  return () => {
    CommandList = commands
    CommandIndex = index
    return true
  }
}

/**
 * 显示文本
 * @param {Object} $
 * @param {ActorGetter} $.target
 * @param {string} $.parameters
 * @param {string} $.content
 * @returns {Function}
 */
Command.showText = function ({target, parameters, content}) {
  const getActor = Command.compileActor(target)
  const getContent = Command.compileTextContent(content)
  return () => {
    const commands = EventManager.special.showText
    const fn = !commands ? Command.skip : () => {
      Event.targetActor = getActor()
      Command.parameters = parameters
      Command.textContent = getContent()
      Event.stack.push(CommandList, CommandIndex)
      CommandList = commands
      CommandIndex = 0
      return true
    }
    // 编译时不能确定事件已加载，因此使用运行时编译
    return (CommandList[CommandIndex - 1] = fn)()
  }
}

/**
 * 显示选项
 * @param {Object} $
 * @param {Array<Object>} $.choices
 * @param {string} parameters
 * @returns {Function}
 */
Command.showChoices = function showChoices({choices, parameters}) {
  // 解析变量文本内容
  let {parseVariable} = showChoices
  if (!parseVariable) {
    const regexp = /<(local):(.*?)>|<(global):([0-9a-f]{16})>/g
    const replacer = (match, m1, m2, m3, m4) => {
      const tag = m1 ?? m3
      const key = m2 ?? m4
      switch (tag) {
        case 'local':
          return Event.attributes[key]
        case 'global':
          return Variable.get(key)
      }
    }
    const mapper = content => content.replace(regexp, replacer)
    parseVariable = showChoices.parseVariable = contents => contents.map(mapper)
  }
  const {commands, index} = this.stack.get()
  const pop = Command.goto(commands, index + 2)
  const contents = []
  const branches = []
  for (const choice of choices) {
    contents.push(choice.content)
    branches.push(Command.compile(choice.commands, pop))
  }
  const fn1 = () => {
    const commands = EventManager.special.showChoices
    const fn = !commands ? Command.skip : () => {
      Command.parameters = parameters
      Command.choiceContents = parseVariable(contents)
      Command.choiceIndex = -1
      Event.stack.push(CommandList, CommandIndex)
      CommandList = commands
      CommandIndex = 0
      return true
    }
    // 编译时不能确定事件已加载，因此使用运行时编译
    return (CommandList[CommandIndex - 1] = fn)()
  }
  const fn2 = () => {
    switch (Command.choiceIndex) {
      case -1:
        return true
      default: {
        const commands = branches[Command.choiceIndex]
        if (commands) {
          CommandList = commands
          CommandIndex = 0
        }
        return true
      }
    }
  }
  return [fn1, fn2]
}

/**
 * 注释
 * @param {Object} $
 * @param {string} $.comment
 * @returns {null}
 */
Command.comment = function ({comment}) {
  return null
}

/** 设置布尔值 */
Command.setBoolean = function setBoolean(IIFE) {
  const {BOOLEAN_GET, LIST_GET} = Attribute

  // 布尔值操作映射表
  const operationMap = {
    set: Attribute.BOOLEAN_SET,
    not: Attribute.BOOLEAN_NOT,
    and: Attribute.BOOLEAN_AND,
    or: Attribute.BOOLEAN_OR,
    xor: Attribute.BOOLEAN_XOR,
  }

  // 编译操作数
  const compileOperand = operand => {
    switch (operand.type) {
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable':
        return Command.compileVariable(operand.variable, BOOLEAN_GET)
      case 'list': {
        const getList = Command.compileVariable(operand.variable, LIST_GET)
        const getIndex = Command.compileNumber(operand.index, -1)
        return () => {
          const value = getList()?.[getIndex()]
          return typeof value === 'boolean' ? value : undefined
        }
      }
      case 'parameter': {
        const getKey = Command.compileString(operand.key)
        return () => Command.getParameter(getKey(), 'boolean')
      }
      case 'script':
        return Command.compileFunction(operand.script)
    }
  }

  /**
   * 设置布尔值
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {string} $.operation
   * @param {Object} $.operand
   * @returns {Function}
   */
  return function ({variable, operation, operand}) {
    const OP = operationMap[operation]
    const getter = compileOperand(operand)
    const setter = Command.compileVariable(variable, OP)
    return () => {
      const value = getter()
      if (typeof value === 'boolean') {
        setter(value)
      }
      return true
    }
  }
}()

/** 设置数值 */
Command.setNumber = function setNumber(IIFE) {
  const {NUMBER_GET, STRING_GET, LIST_GET} = Attribute

  // 数值操作映射表
  const operationMap = {
    set: Attribute.NUMBER_SET,
    add: Attribute.NUMBER_ADD,
    sub: Attribute.NUMBER_SUB,
    mul: Attribute.NUMBER_MUL,
    div: Attribute.NUMBER_DIV,
    mod: Attribute.NUMBER_MOD,
  }

  // 操作优先级映射表
  const operationPriorityMap = {
    add: 0,
    sub: 0,
    mul: 1,
    div: 1,
    mod: 1,
  }

  // 编译操作数
  const compileOperand = operand => {
    switch (operand.type) {
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable':
        return Command.compileVariable(operand.variable, NUMBER_GET)
      case 'math':
        switch (operand.method) {
          case 'round': {
            const {round, roundTo} = Math
            const getter = Command.compileVariable(operand.variable, NUMBER_GET)
            const decimals = operand.decimals
            return decimals === 0
            ? () => round(getter())
            : () => roundTo(getter(), decimals)
          }
          case 'floor':
          case 'ceil':
          case 'sqrt':
          case 'abs': {
            const mathMethod = Math[operand.method]
            const getter = Command.compileVariable(operand.variable, NUMBER_GET)
            return () => mathMethod(getter())
          }
          case 'cos':
          case 'sin':
          case 'tan': {
            const mathMethod = Math[operand.method]
            const getAngle = Command.compileVariable(operand.variable, NUMBER_GET)
            return () => mathMethod(Math.radians(getAngle()))
          }
          case 'random':
            return Math.random
          case 'random-int': {
            const {randomInt} = Math
            const getMin = Command.compileNumber(operand.min)
            const getMax = Command.compileNumber(operand.max)
            return () => randomInt(getMin(), getMax())
          }
          case 'distance': {
            const {dist} = Math
            const getStart = Command.compilePosition(operand.start)
            const getEnd = Command.compilePosition(operand.end)
            return () => {
              const start = getStart()
              const end = getEnd()
              if (start && end) {
                return dist(start.x, start.y, end.x, end.y)
              }
            }
          }
          case 'distance-x': {
            const {abs} = Math
            const getStart = Command.compilePosition(operand.start)
            const getEnd = Command.compilePosition(operand.end)
            return () => {
              const start = getStart()
              const end = getEnd()
              if (start && end) {
                return abs(start.x - end.x)
              }
            }
          }
          case 'distance-y': {
            const {abs} = Math
            const getStart = Command.compilePosition(operand.start)
            const getEnd = Command.compilePosition(operand.end)
            return () => {
              const start = getStart()
              const end = getEnd()
              if (start && end) {
                return abs(start.y - end.y)
              }
            }
          }
          case 'relative-angle': {
            const {degrees, atan2} = Math
            const getStart = Command.compilePosition(operand.start)
            const getEnd = Command.compilePosition(operand.end)
            return () => {
              const start = getStart()
              const end = getEnd()
              if (start && end) {
                const x = end.x - start.x
                const y = end.y - start.y
                return degrees(atan2(y, x))
              }
            }
          }
        }
      case 'string': {
        const getter = Command.compileVariable(operand.variable, STRING_GET)
        switch (operand.method) {
          case 'length':
            return () => getter()?.length
          case 'parse':
            return () => parseFloat(getter())
          case 'search': {
            const getSearch = Command.compileString(operand.search)
            return () => getter()?.indexOf(getSearch() || undefined)
          }
        }
      }
      case 'object':
        switch (operand.property) {
          case 'actor-x': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.x
          }
          case 'actor-y': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.y
          }
          case 'actor-ui-x': {
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const scene = Scene.binding
              const actor = getActor()
              if (scene !== null && actor) {
                const {width, scrollLeft} = Camera
                const x = actor.x * scene.tileWidth
                return (x - scrollLeft) / width * GL.width / UI.scale
              }
            }
          }
          case 'actor-ui-y': {
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const scene = Scene.binding
              const actor = getActor()
              if (scene !== null && actor) {
                const {height, scrollTop} = Camera
                const y = actor.y * scene.tileHeight
                return (y - scrollTop) / height * GL.height / UI.scale
              }
            }
          }
          case 'actor-screen-x': {
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const scene = Scene.binding
              const actor = getActor()
              if (scene !== null && actor) {
                const {width, scrollLeft} = Camera
                const x = actor.x * scene.tileWidth
                return (x - scrollLeft) / width * GL.width
              }
            }
          }
          case 'actor-screen-y': {
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const scene = Scene.binding
              const actor = getActor()
              if (scene !== null && actor) {
                const {height, scrollTop} = Camera
                const y = actor.y * scene.tileHeight
                return (y - scrollTop) / height * GL.height
              }
            }
          }
          case 'actor-angle': {
            const {degrees} = Math
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const actor = getActor()
              if (actor) {
                return degrees(actor.angle)
              }
              return undefined
            }
          }
          case 'actor-direction': {
            const {degrees} = Math
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const animation = getActor()?.animation
              if (animation) {
                return degrees(animation.getDirectionAngle())
              }
              return undefined
            }
          }
          case 'actor-movement-speed': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.navigator.movementSpeed
          }
          case 'actor-collision-size': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.collider.size
          }
          case 'actor-collision-weight': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.collider.weight
          }
          case 'actor-scaling-factor': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.scale
          }
          case 'actor-inventory-item-quantity': {
            const getActor = Command.compileActor(operand.actor)
            const getId = Command.compileString(operand.itemId)
            return () => getActor()?.inventory.count(getId())
          }
          case 'actor-inventory-equipment-quantity': {
            const getActor = Command.compileActor(operand.actor)
            const getId = Command.compileString(operand.equipmentId)
            return () => getActor()?.inventory.count(getId())
          }
          case 'actor-inventory-money': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.inventory.money
          }
          case 'actor-inventory-used-space': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.inventory.size
          }
          case 'actor-inventory-version': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.inventory.version ?? -1
          }
          case 'actor-skill-version': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.skillManager.version ?? -1
          }
          case 'actor-state-version': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.stateManager.version ?? -1
          }
          case 'actor-equipment-version': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.equipmentManager.version ?? -1
          }
          case 'actor-shortcut-version': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.shortcutManager.version ?? -1
          }
          case 'actor-animation-current-time': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.animation?.getCurrentTime()
          }
          case 'actor-animation-duration': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.animation?.getDuration()
          }
          case 'actor-animation-progress': {
            const getActor = Command.compileActor(operand.actor)
            return () => {
              const animation = getActor()?.animation
              if (animation?.length > 0) {
                return animation.index / animation.length
              }
            }
          }
          case 'actor-cooldown-time': {
            const getActor = Command.compileActor(operand.actor)
            const getKey = Command.compileEnumValue(operand.key)
            return () => {
              const actor = getActor()
              if (actor) {
                return actor.cooldownManager.get(getKey())?.cooldown ?? 0
              }
            }
          }
          case 'actor-cooldown-duration': {
            const getActor = Command.compileActor(operand.actor)
            const getKey = Command.compileEnumValue(operand.key)
            return () => {
              const actor = getActor()
              if (actor) {
                return actor.cooldownManager.get(getKey())?.duration ?? 0
              }
            }
          }
          case 'actor-cooldown-progress': {
            const getActor = Command.compileActor(operand.actor)
            const getKey = Command.compileEnumValue(operand.key)
            return () => {
              const actor = getActor()
              if (actor) {
                return actor.cooldownManager.get(getKey())?.progress ?? 0
              }
            }
          }
          case 'skill-cooldown-time': {
            const getSkill = Command.compileSkill(operand.skill)
            return () => getSkill()?.cooldown
          }
          case 'skill-cooldown-duration': {
            const getSkill = Command.compileSkill(operand.skill)
            return () => getSkill()?.duration
          }
          case 'skill-cooldown-progress': {
            const getSkill = Command.compileSkill(operand.skill)
            return () => getSkill()?.progress
          }
          case 'state-current-time': {
            const getState = Command.compileState(operand.state)
            return () => getState()?.currentTime
          }
          case 'state-duration': {
            const getState = Command.compileState(operand.state)
            return () => getState()?.duration
          }
          case 'state-progress': {
            const getState = Command.compileState(operand.state)
            return () => {
              const state = getState()
              if (state) {
                return state.duration === 0 ? 1 : state.currentTime / state.duration
              }
            }
          }
          case 'equipment-order': {
            const getEquipment = Command.compileEquipment(operand.equipment)
            return () => getEquipment()?.order
          }
          case 'item-order': {
            const getItem = Command.compileItem(operand.item)
            return () => getItem()?.order
          }
          case 'item-quantity': {
            const getItem = Command.compileItem(operand.item)
            return () => getItem()?.quantity
          }
          case 'trigger-speed': {
            const getTrigger = Command.compileTrigger(operand.trigger)
            return () => getTrigger()?.speed
          }
          case 'trigger-angle': {
            const {degrees} = Math
            const getTrigger = Command.compileTrigger(operand.trigger)
            return () => {
              const trigger = getTrigger()
              if (trigger) {
                return degrees(trigger.angle)
              }
            }
          }
          case 'tilemap-width': {
            const getTilemap = Command.compileTilemap(operand.tilemap)
            return () => getTilemap()?.width
          }
          case 'tilemap-height': {
            const getTilemap = Command.compileTilemap(operand.tilemap)
            return () => getTilemap()?.height
          }
          case 'list-length': {
            const getList = Command.compileVariable(operand.variable, LIST_GET)
            return () => {
              return getList()?.length
            }
          }
        }
      case 'element': {
        const {element, property} = operand
        const getElement = Command.compileElement(element)
        const index = property.indexOf('-')
        const prefix = property.slice(0, index)
        const key = property.slice(index + 1)
        switch (prefix) {
          case 'element':
            switch (key) {
              case 'x':
              case 'y':
              case 'width':
              case 'height':
                return () => getElement()?.[key]
              case 'children-count':
                return () => getElement()?.children.length
              case 'index-of-selected-button':
                return () => UI.getIndexOfSelectedButton(getElement())
            }
          case 'transform':
            return () => getElement()?.transform[key]
          case 'window':
            switch (key) {
              case 'visibleGridColumns':
                return () => {
                  const element = getElement()
                  if (element instanceof WindowElement) {
                    const columns = element.getVisibleGridColumns()
                    return Number.isFinite(columns) ? columns : 0
                  }
                }
              case 'visibleGridRows':
                return () => {
                  const element = getElement()
                  if (element instanceof WindowElement) {
                    const rows = element.getVisibleGridRows()
                    return Number.isFinite(rows) ? rows : 0
                  }
                }
            }
          case 'text':
            return () => {
              const element = getElement()
              if (element instanceof TextElement) {
                element.update()
                return element[key]
              }
            }
          case 'textBox':
            return () => {
              const element = getElement()
              if (element instanceof TextBoxElement) {
                return element[key]
              }
            }
          case 'dialogBox':
            switch (key) {
              case 'printEndX':
                return () => {
                  const element = getElement()
                  if (element instanceof DialogBoxElement) {
                    return element.printEndX
                  }
                }
              case 'printEndY':
                return () => {
                  const element = getElement()
                  if (element instanceof DialogBoxElement) {
                    return element.printEndY
                  }
                }
            }
        }
      }
      case 'list': {
        const getList = Command.compileVariable(operand.variable, LIST_GET)
        const getIndex = Command.compileNumber(operand.index, -1)
        return () => {
          const value = getList()?.[getIndex()]
          return typeof value === 'number' ? value : undefined
        }
      }
      case 'parameter': {
        const getKey = Command.compileString(operand.key)
        return () => Command.getParameter(getKey(), 'number')
      }
      case 'script':
        return Command.compileFunction(operand.script)
      case 'other':
        switch (operand.data) {
          case 'trigger-button':
            return () => Input.event?.button
          case 'trigger-wheel-y':
            return () => Input.event?.deltaY
          case 'trigger-gamepad-button':
            return () => Controller.buttonCode
          case 'gamepad-left-stick-angle':
            return () => Controller.states.LeftStickAngle
          case 'gamepad-right-stick-angle':
            return () => Controller.states.RightStickAngle
          case 'mouse-screen-x':
            return () => Input.mouse.screenX
          case 'mouse-screen-y':
            return () => Input.mouse.screenY
          case 'mouse-ui-x':
            return () => Input.mouse.screenX / UI.scale
          case 'mouse-ui-y':
            return () => Input.mouse.screenY / UI.scale
          case 'mouse-scene-x':
            return () => Input.mouse.sceneX
          case 'mouse-scene-y':
            return () => Input.mouse.sceneY
          case 'start-position-x':
            return () => Data.config.startPosition.x
          case 'start-position-y':
            return () => Data.config.startPosition.y
          case 'camera-x':
            return () => Camera.x
          case 'camera-y':
            return () => Camera.y
          case 'camera-zoom':
            return () => Camera.zoom
          case 'raw-camera-zoom':
            return () => Camera.rawZoom
          case 'screen-width':
            return () => GL.width
          case 'screen-height':
            return () => GL.height
          case 'scene-scale':
            return () => Scene.scale
          case 'ui-scale':
            return () => UI.scale
          case 'scene-width':
            return () => Scene.binding?.width
          case 'scene-height':
            return () => Scene.binding?.height
          case 'play-time':
            return () => Time.playTime
          case 'elapsed-time':
            return () => Time.elapsed
          case 'delta-time':
            return () => Time.deltaTime
          case 'raw-delta-time':
            return () => Time.rawDeltaTime
          case 'timestamp':
            return () => Date.now()
          case 'party-version':
            return () => Party.version
          case 'party-member-count':
            return () => Party.members.length
          case 'actor-count':
            return () => Scene.binding?.actors.count(operand.teamId) ?? 0
          case 'latest-item-increment':
            return () => Item.increment
          case 'latest-money-increment':
            return () => Inventory.moneyIncrement
        }
    }
  }

  // 编译操作数列表
  const compileOperands = operands => {
    let length = operands.length
    if (length === 1) {
      return compileOperand(operands[0])
    }
    const items = new Array(length)
    for (let i = 0; i < length; i++) {
      const operand = operands[i]
      const operation = operand.operation.replace('()', '')
      let priority = operationPriorityMap[operation]
      if (operation !== operand.operation) {
        priority += 2
      }
      items[i] = {
        operation: operation,
        priority: priority,
        getter: compileOperand(operand),
      }
    }
    do {
      let getter
      let priority = 0
      for (let i = 1; i < length; i++) {
        priority = Math.max(priority, items[i].priority)
      }
      for (let i = 1; i < length; i++) {
        const item = items[i]
        if (item.priority === priority) {
          const prev = items[i - 1]
          const a = prev.getter
          const b = item.getter
          switch (item.operation) {
            case 'add': getter = () => a() + b(); break
            case 'sub': getter = () => a() - b(); break
            case 'mul': getter = () => a() * b(); break
            case 'div': getter = () => a() / b(); break
            case 'mod': getter = () => a() % b(); break
          }
          prev.getter = getter
          items.splice(i--, 1)
          length--
        }
      }
    } while (length > 1)
    return items[0].getter
  }

  /**
   * 设置数值
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {string} $.operation
   * @param {Object[]} $.operands
   * @returns {Function}
   */
  return function ({variable, operation, operands}) {
    const OP = operationMap[operation]
    const getter = compileOperands(operands)
    const setter = Command.compileVariable(variable, OP)
    return () => {
      const value = getter()
      if (Number.isFinite(value)) {
        setter(value)
      }
      return true
    }
  }
}()

/** 设置字符串 */
Command.setString = function setString(IIFE) {
  const {GET, STRING_GET, LIST_GET} = Attribute
  const patternEscape = /[(){}\\^$*+?.|[\]]/g

  // 字符串操作映射表
  const operationMap = {
    set: Attribute.STRING_SET,
    add: Attribute.STRING_ADD,
  }

  // 编译操作数
  const compileOperand = operand => {
    switch (operand.type) {
      case 'constant': {
        const {value} = operand
        return () => value
      }
      case 'variable': {
        const getter = Command.compileVariable(operand.variable, GET)
        return () => {
          const value = getter()
          switch (typeof value) {
            case 'string':
              return value
            case 'number':
            case 'boolean':
              return value.toString()
          }
        }
      }
      case 'template':
        return Command.compileTextContent(operand.value)
      case 'string':
        switch (operand.method) {
          case 'char': {
            const getter = Command.compileVariable(operand.variable, STRING_GET)
            const getIndex = Command.compileNumber(operand.index, -1)
            return () => getter()?.[getIndex()]
          }
          case 'slice': {
            const getter = Command.compileVariable(operand.variable, STRING_GET)
            const getBegin = Command.compileNumber(operand.begin)
            const getEnd = Command.compileNumber(operand.end)
            return () => getter()?.slice(getBegin(), getEnd())
          }
          case 'pad-start': {
            const getter = Command.compileVariable(operand.variable, GET)
            const {length, pad} = operand
            return () => {
              let value = getter()
              switch (typeof value) {
                case 'number':
                  value = value.toString()
                case 'string':
                  return value.padStart(length, pad)
              }
            }
          }
          case 'replace':
          case 'replace-all': {
            const getter = Command.compileVariable(operand.variable, STRING_GET)
            const getPattern = Command.compileString(operand.pattern, null)
            const getReplacement = Command.compileString(operand.replacement, null)
            return () => {
              let pattern = getPattern()
              const replacement = getReplacement()
              if (pattern !== null && replacement !== null) {
                if (operand.method === 'replace-all') {
                  pattern = pattern.replace(patternEscape, '\\$&')
                  pattern = new RegExp(pattern, 'g')
                }
                return getter()?.replace(pattern, replacement)
              }
            }
          }
        }
      case 'attribute': {
        const string = Attribute.getKey(operand.attributeId) || undefined
        return () => string
      }
      case 'enum': {
        const string = Enum.getValue(operand.stringId) || undefined
        return () => string
      }
      case 'object':
        switch (operand.property) {
          case 'actor-team-id': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.teamId
          }
          case 'actor-file-id': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.data.id
          }
          case 'actor-animation-motion-name': {
            const getActor = Command.compileActor(operand.actor)
            return () => getActor()?.animation?.motion?.name
          }
          case 'skill-file-id': {
            const getSkill = Command.compileSkill(operand.skill)
            return () => getSkill()?.id
          }
          case 'trigger-file-id': {
            const getTrigger = Command.compileTrigger(operand.trigger)
            return () => getTrigger()?.id
          }
          case 'state-file-id': {
            const getState = Command.compileState(operand.state)
            return () => getState()?.id
          }
          case 'equipment-file-id': {
            const getEquipment = Command.compileEquipment(operand.equipment)
            return () => getEquipment()?.id
          }
          case 'equipment-slot': {
            const getEquipment = Command.compileEquipment(operand.equipment)
            return () => getEquipment()?.slot
          }
          case 'item-file-id': {
            const getItem = Command.compileItem(operand.item)
            return () => getItem()?.id
          }
          case 'file-id': {
            const {fileId} = operand
            return () => fileId
          }
        }
      case 'element': {
        const getElement = Command.compileElement(operand.element)
        switch (operand.property) {
          case 'text-content':
            return () => {
              const element = getElement()
              if (element instanceof TextElement) {
                return element.content
              }
            }
          case 'textBox-text':
            return () => {
              const element = getElement()
              if (element instanceof TextBoxElement) {
                return element.text
              }
            }
          case 'dialogBox-content':
            return () => {
              const element = getElement()
              if (element instanceof DialogBoxElement) {
                return element.content
              }
            }
        }
      }
      case 'list': {
        const getList = Command.compileVariable(operand.variable, LIST_GET)
        const getIndex = Command.compileNumber(operand.index, -1)
        return () => {
          const value = getList()?.[getIndex()]
          return typeof value === 'string' ? value : undefined
        }
      }
      case 'parameter': {
        const getKey = Command.compileString(operand.key)
        return () => Command.getParameter(getKey(), 'string')
      }
      case 'script':
        return Command.compileFunction(operand.script)
      case 'other':
        switch (operand.data) {
          case 'trigger-key':
            return () => Input.event?.code
          case 'start-position-scene-id':
            return () => Data.config.startPosition.sceneId
          case 'showText-content':
            return () => Command.textContent
          // 补丁：2023-1-18
          case 'showChoices-content-0':
          case 'showChoices-content-1':
          case 'showChoices-content-2':
          case 'showChoices-content-3': {
            const index = parseInt(operand.data.slice(-1))
            return () => Command.choiceContents[index] ?? ''
          }
          case 'showChoices-content': {
            const getIndex = Command.compileNumber(operand.choiceIndex)
            return () => Command.choiceContents[getIndex()] ?? ''
          }
          case 'parse-timestamp': {
            const getTimestamp = Command.compileNumber(operand.variable, -1)
            const format = operand.format
            return () => {
              const timestamp = getTimestamp()
              if (timestamp !== -1) {
                return Time.parseDateTimestamp(timestamp, format)
              }
            }
          }
          case 'screenshot': {
            const {width, height} = operand
            return () => GL.offscreen.current.toBase64(width, height)
          }
          case 'game-language':
            return () => Local.language
        }
    }
  }

  /**
   * 设置字符串
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {string} $.operation
   * @param {Object} $.operand
   * @returns {Function}
   */
  return function ({variable, operation, operand}) {
    const OP = operationMap[operation]
    const getter = compileOperand(operand)
    const setter = Command.compileVariable(variable, OP)
    return () => {
      const value = getter()
      if (typeof value === 'string') {
        setter(value)
      }
      return true
    }
  }
}()

/** 设置对象 */
Command.setObject = function setObject(IIFE) {
  const {OBJECT_GET, OBJECT_SET, LIST_GET} = Attribute

  // 编译操作数
  const compileOperand = operand => {
    switch (operand.type) {
      case 'none':
        return () => undefined
      case 'actor':
        return Command.compileActor(operand.actor)
      case 'skill':
        return Command.compileSkill(operand.skill)
      case 'state':
        return Command.compileState(operand.state)
      case 'equipment':
        return Command.compileEquipment(operand.equipment)
      case 'item':
        return Command.compileItem(operand.item)
      case 'trigger':
        return Command.compileTrigger(operand.trigger)
      case 'light':
        return Command.compileLight(operand.light)
      case 'element':
        return Command.compileElement(operand.element)
      case 'variable':
        return Command.compileVariable(operand.variable, OBJECT_GET)
      case 'list': {
        const getList = Command.compileVariable(operand.variable, LIST_GET)
        const getIndex = Command.compileNumber(operand.index, -1)
        return () => {
          const value = getList()?.[getIndex()]
          return typeof value === 'object' ? value : undefined
        }
      }
    }
  }

  /**
   * 设置对象
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {Object} $.operand
   * @returns {Function}
   */
  return function ({variable, operand}) {
    const getter = compileOperand(operand)
    const setter = Command.compileVariable(variable, OBJECT_SET)
    return () => {
      setter(getter())
      return true
    }
  }
}()

/** 设置列表 */
Command.setList = function setList(IIFE) {
  const {GET, NUMBER_GET, STRING_GET, OBJECT_SET, LIST_GET} = Attribute
  const {floor} = Math
  const compileListIndex = index => {
    switch (typeof index) {
      case 'number':
        return () => index
      case 'object': {
        const getter = Command.compileVariable(index, NUMBER_GET)
        return () => {
          const index = getter()
          if (index >= 0) {
            return floor(index)
          }
        }
      }
    }
  }
  /**
   * 设置列表
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {string} $.operation
   * @param {number[]|string[]} [$.list]
   * @param {number|VariableGetter} [$.index]
   * @param {boolean|number|string} [$.constant]
   * @param {VariableGetter} [$.operand]
   * @param {string|VariableGetter} [$.separator]
   * @param {string} [$.groupId]
   * @param {ActorGetter} [$.actor]
   * @returns {Function}
   */
  return function ({variable, operation, list, index, constant, operand, separator, groupId, actor}) {
    switch (operation) {
      case 'set-empty': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        return () => {
          setList([])
          return true
        }
      }
      case 'set-numbers':
      case 'set-strings': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        return () => {
          setList(list.slice())
          return true
        }
      }
      case 'set-boolean':
      case 'set-number':
      case 'set-string': {
        const getList = Command.compileVariable(variable, LIST_GET)
        const getIndex = compileListIndex(index)
        return () => {
          const list = getList()
          const index = getIndex()
          if (list?.length >= index) {
            list[index] = constant
          }
          return true
        }
      }
      case 'set-variable': {
        const getList = Command.compileVariable(variable, LIST_GET)
        const getIndex = compileListIndex(index)
        const getValue = Command.compileVariable(operand, GET)
        return () => {
          const list = getList()
          const index = getIndex()
          const value = getValue()
          if (list?.length >= index && value !== undefined) {
            list[index] = value
          }
          return true
        }
      }
      case 'split-string': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const getString = Command.compileVariable(operand, STRING_GET)
        const getSeparator = Command.compileString(separator, null)
        return () => {
          const string = getString()
          const separator = getSeparator()
          if (string !== undefined && separator !== null) {
            setList(string.split(separator))
          }
          return true
        }
      }
      case 'push':
      case 'remove': {
        const getList = Command.compileVariable(variable, LIST_GET)
        const getValue = Command.compileVariable(operand, GET)
        return () => {
          const list = getList()
          const value = getValue()
          if (list !== undefined && value !== undefined) {
            list[operation](value)
          }
          return true
        }
      }
      case 'get-attribute-names': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const group = Attribute.getGroup(groupId)
        const names = Object.values(group ?? {})
        return () => {
          setList(names.slice())
          return true
        }
      }
      case 'get-attribute-keys': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const group = Attribute.getGroup(groupId)
        const keys = Object.keys(group ?? {})
        return () => {
          setList(keys.slice())
          return true
        }
      }
      case 'get-enum-names': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const group = Enum.getGroup(groupId)
        const names = Object.values(group ?? {})
        return () => {
          setList(names.slice())
          return true
        }
      }
      case 'get-enum-values': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const group = Enum.getGroup(groupId)
        const values = Object.keys(group ?? {})
        return () => {
          setList(values.slice())
          return true
        }
      }
      case 'get-actor-targets': {
        const setList = Command.compileVariable(variable, OBJECT_SET)
        const getActor = Command.compileActor(actor)
        return () => {
          const actor = getActor()
          if (actor) {
            setList(actor.targetManager.targets.slice())
          }
          return true
        }
      }
    }
  }
}()

/**
 * 删除变量
 * @param {Object} $
 * @param {VariableGetter} $.variable
 * @returns {Function}
 */
Command.deleteVariable = function ({variable}) {
  const deleter = Command.compileVariable(variable, Attribute.DELETE)
  return () => {
    deleter()
    return true
  }
}

/**
 * 条件分支
 * @param {Object} $
 * @param {Object[]} $.branches
 * @param {Object[]} [$.elseCommands]
 * @returns {Function}
 */
Command.if = function ({branches, elseCommands}) {
  const {commands, index} = this.stack.get()
  const pop = Command.goto(commands, index + 1)
  const length = branches.length
  const testers = new Array(length)
  const functions = new Array(length)
  for (let i = 0; i < length; i++) {
    const {mode, conditions, commands} = branches[i]
    testers[i] = Command.compileConditions(mode, conditions)
    functions[i] = Command.goto(Command.compile(commands, pop), 0)
  }
  const elseFn = elseCommands !== undefined
  ? Command.goto(Command.compile(elseCommands, pop), 0)
  : Command.skip
  if (length < 6) {
    const [a, b, c, d, e] = testers
    const [f, g, h, i, j] = functions
    switch (length) {
      case 1: return () => (a() ? f : elseFn)()
      case 2: return () => (a() ? f : b() ? g : elseFn)()
      case 3: return () => (a() ? f : b() ? g : c() ? h : elseFn)()
      case 4: return () => (a() ? f : b() ? g : c() ? h : d() ? i : elseFn)()
      case 5: return () => (a() ? f : b() ? g : c() ? h : d() ? i : e() ? j : elseFn)()
    }
  }
  return () => {
    for (let i = 0; i < length; i++) {
      if (testers[i]()) {
        return functions[i]()
      }
    }
    return elseFn()
  }
}

/** 匹配 */
Command.switch = function Switch(IIFE) {
  const {GET} = Attribute
  let Value

  // 编译条件
  const compileCondition = condition => {
    switch (condition.type) {
      case 'none':
        return () => Value === undefined
      case 'boolean':
      case 'number':
      case 'string': {
        const {value} = condition
        return () => Value === value
      }
      case 'attribute': {
        const string = Attribute.getKey(condition.attributeId) || null
        return () => Value === string
      }
      case 'enum': {
        const string = Enum.getValue(condition.stringId) || null
        return () => Value === string
      }
      case 'keyboard': {
        const {keycode} = condition
        return () => Value === keycode
      }
      case 'gamepad': {
        const {button} = condition
        return () => Value === button
      }
      case 'mouse': {
        const {button} = condition
        return () => Value === button
      }
      case 'variable': {
        const getter = Command.compileVariable(condition.variable, GET)
        return () => Value === getter()
      }
    }
  }

  // 编译条件列表
  const compileConditions = conditions => {
    const length = conditions.length
    if (length === 1) {
      return compileCondition(conditions[0])
    }
    const testers = new Array(length)
    for (let i = 0; i < length; i++) {
      testers[i] = compileCondition(conditions[i])
    }
    if (length < 6) {
      const [a, b, c, d, e] = testers
      switch (length) {
        case 2: return () => a() || b()
        case 3: return () => a() || b() || c()
        case 4: return () => a() || b() || c() || d()
        case 5: return () => a() || b() || c() || d() || e()
      }
    }
    return () => {
      for (let i = 0; i < length; i++) {
        if (testers[i]()) {
          return true
        }
      }
      return false
    }
  }

  /**
   * 匹配
   * @param {Object} $
   * @param {VariableGetter} $.variable
   * @param {Object[]} $.branches
   * @param {Object[]} [$.defaultCommands]
   * @returns {Function}
   */
  return function ({variable, branches, defaultCommands}) {
    const {commands, index} = this.stack.get()
    const pop = Command.goto(commands, index + 1)
    const length = branches.length
    const testers = new Array(length)
    const functions = new Array(length)
    for (let i = 0; i < length; i++) {
      const {conditions, commands} = branches[i]
      testers[i] = compileConditions(conditions)
      functions[i] = Command.goto(Command.compile(commands, pop), 0)
    }
    const defFn = defaultCommands !== undefined
    ? Command.goto(Command.compile(defaultCommands, pop), 0)
    : Command.skip
    const getter = Command.compileVariable(variable, GET)
    if (length < 6) {
      const [a, b, c, d, e] = testers
      const [f, g, h, i, j] = functions
      switch (length) {
        case 1: return () => (Value = getter(), a() ? f : defFn)()
        case 2: return () => (Value = getter(), a() ? f : b() ? g : defFn)()
        case 3: return () => (Value = getter(), a() ? f : b() ? g : c() ? h : defFn)()
        case 4: return () => (Value = getter(), a() ? f : b() ? g : c() ? h : d() ? i : defFn)()
        case 5: return () => (Value = getter(), a() ? f : b() ? g : c() ? h : d() ? i : e() ? j : defFn)()
      }
    }
    return () => {
      Value = getter()
      for (let i = 0; i < length; i++) {
        if (testers[i]()) {
          return functions[i]()
        }
      }
      return defFn()
    }
  }
}()

/**
 * 循环
 * @param {Object} $
 * @param {string} $.mode
 * @param {Object[]} $.conditions
 * @param {Object[]} $.commands
 * @returns {Function|null}
 */
Command.loop = function ({mode, conditions, commands}) {
  if (commands.length === 0) {
    return null
  }
  const cmdpath = this.stack[0].path
  const context = this.stack.get()
  const nextCommands = context.commands
  const nextIndex = context.index + 1
  let infiniteLoopTest = Function.empty
  if (Stats.debug) {
    let timestamp = 0
    let cycleCount = 0
    infiniteLoopTest = () => {
      if (timestamp !== Time.timestamp) {
        timestamp = Time.timestamp
        cycleCount = 1
      } else if (++cycleCount > 100000000) {
        CommandList = nextCommands
        CommandIndex = nextIndex
        console.error(`The number of loops exceeds 100000000, it may be an infinite loop.\n${cmdpath}`)
      }
    }
  }
  if (conditions.length !== 0) {
    const tester = Command.compileConditions(mode, conditions)
    const loopCommands = Command.compile(commands, () => {
      if (tester()) {
        CommandIndex = 0
        infiniteLoopTest()
      } else {
        CommandList = nextCommands
        CommandIndex = nextIndex
      }
      return true
    }, true)
    return () => {
      if (tester()) {
        CommandList = loopCommands
        CommandIndex = 0
      }
      return true
    }
  } else {
    const loopCommands = Command.compile(commands, () => {
      CommandIndex = 0
      infiniteLoopTest()
      return true
    }, true)
    return Command.goto(loopCommands, 0)
  }
}

/** 遍历 */
Command.forEach = function forEach(IIFE) {
  const {SET, LIST_GET} = Attribute

  // 编译通用迭代器
  const compileCommonIterator = variable => {
    const context = Command.stack.get()
    const nextCommands = context.commands
    const nextIndex = context.index + 1
    const setter = Command.compileVariable(variable, SET)
    return () => {
      const wrap = Event.forEach[0]
      const value = wrap.list[wrap.index++]
      if (value !== undefined) {
        setter(value)
        CommandIndex = 0
      } else {
        Event.forEach.shift()
        CommandList = nextCommands
        CommandIndex = nextIndex
      }
      return true
    }
  }

  // 编译存档迭代器
  const compileSaveIterator = variable => {
    const context = Command.stack.get()
    const nextCommands = context.commands
    const nextIndex = context.index + 1
    const setSaveIndex = Command.compileVariable(variable, SET)
    return () => {
      const wrap = Event.forEach[0]
      const meta = wrap.list[wrap.index++]
      if (meta) {
        setSaveIndex(meta.index)
        const {data} = meta
        const {attributes} = Event
        for (const key of Object.keys(data)) {
          attributes[key] = data[key]
        }
        CommandIndex = 0
      } else {
        Event.forEach.shift()
        CommandList = nextCommands
        CommandIndex = nextIndex
      }
      return true
    }
  }

  // 编译角色组件列表
  const compileActorComponentList = (actor, data) => {
    const getActor = Command.compileActor(actor)
    return () => {
      const actor = getActor()
      if (actor) {
        switch (data) {
          case 'skill':
            return Object.values(actor.skillManager.idMap)
          case 'state':
            return Object.values(actor.stateManager.idMap)
          case 'equipment':
            return Object.values(actor.equipmentManager.slotMap)
          case 'inventory':
            return actor.inventory.list.slice()
        }
      }
    }
  }

  /**
   * 遍历
   * @param {Object} $
   * @param {string} $.data
   * @param {VariableGetter} [$.list]
   * @param {ActorGetter} [$.actor]
   * @param {ElementGetter} [$.element]
   * @param {string} [$.groupId]
   * @param {VariableGetter} [$.variable]
   * @param {VariableGetter} [$.saveIndex]
   * @param {Object[]} $.commands
   * @returns {Function}
   */
  return function ({data, list, actor, element, groupId, variable, saveIndex, commands}) {
    if (commands.length === 0) {
      return null
    }
    let getList
    switch (data) {
      case 'list':
        getList = Command.compileVariable(list, LIST_GET)
        break
      case 'skill':
      case 'state':
      case 'equipment':
      case 'inventory':
        getList = compileActorComponentList(actor, data)
        break
      case 'element': {
        const getElement = Command.compileElement(element)
        getList = () => getElement()?.children.slice()
        break
      }
      case 'member':
        getList = () => Party.members.slice()
        break
      case 'attribute': {
        const group = Attribute.getGroup(groupId)
        const attrKeys = Object.keys(group ?? {})
        getList = () => attrKeys
        break
      }
      case 'enum': {
        const group = Enum.getGroup(groupId)
        const enumValues = Object.keys(group ?? {})
        getList = () => enumValues
        break
      }
    }
    switch (data) {
      default: {
        const iterator = compileCommonIterator(variable)
        const loopCommands = Command.compile(commands, iterator, true)
        return () => {
          const list = getList()
          if (list?.length > 0) {
            if (!Event.forEach) Event.forEach = []
            Event.forEach.unshift({list, index: 0})
            CommandList = loopCommands
            iterator()
          }
          return true
        }
      }
      case 'save': {
        const iterator = compileSaveIterator(saveIndex)
        const loopCommands = Command.compile(commands, iterator, true)
        return () => {
          const event = Event
          Data.loadSaveMeta().then(list => {
            if (list.length !== 0) {
              if (!event.forEach) event.forEach = []
              event.forEach.unshift({list, index: 0})
              event.commands = loopCommands
              event.index = loopCommands.length - 1
            }
            event.continue()
          })
          return Event.pause()
        }
      }
    }
  }
}()

/**
 * 跳出循环
 * @returns {Function|null}
 */
Command.break = function () {
  const {stack} = this
  let i = stack.length
  while (--i >= 0) {
    if (stack[i].loop) {
      const {commands, index} = stack[i - 1]
      return Command.goto(commands, index + 1)
    }
  }
  return null
}

/**
 * 继续循环
 * @returns {Function|null}
 */
Command.continue = function () {
  const {stack} = this
  const {length} = stack
  let i = length
  while (--i >= 0) {
    const context = stack[i]
    if (context.loop) {
      const {commands} = context
      return () => {
        let fn
        const index = commands.length - 1
        if (CommandList === commands) {
          fn = () => {
            CommandIndex = index
            return true
          }
        } else {
          fn = () => {
            CommandList = commands
            CommandIndex = index
            return true
          }
        }
        // 编译时不能确定当前指令栈长度，因此使用运行时编译
        return (CommandList[CommandIndex - 1] = fn)()
      }
    }
  }
  return null
}

/**
 * 独立执行
 * @param {Object} $
 * @param {Object[]} $.commands
 * @returns {Function}
 */
Command.independent = function independent({commands}) {
  if (commands.length === 0) {
    return null
  }
  if (!independent.initialized) {
    independent.initialized = true
    independent.stack = new CompileTimeCommandStack()
  }
  const {stack, labels, jumps} = Command
  Command.stack = independent.stack
  const compiledCommands = Command.compile(commands)
  Command.stack = stack
  Command.labels = labels
  Command.jumps = jumps
  return () => {
    const event = new EventHandler(compiledCommands)
    event.inheritEventContext(Event)
    EventHandler.call(event)
    return true
  }
}

/**
 * 调用事件
 * @param {Object} $
 * @param {string} $.type
 * @param {ActorGetter} [$.actor]
 * @param {SkillGetter} [$.skill]
 * @param {StateGetter} [$.state]
 * @param {EquipmentGetter} [$.equipment]
 * @param {ItemGetter} [$.item]
 * @param {LightGetter} [$.light]
 * @param {ElementGetter} [$.element]
 * @param {string} [$.eventId]
 * @param {string} [$.eventType]
 * @returns {Function}
 */
Command.callEvent = function ({type, actor, skill, state, equipment, item, light, element, eventId, eventType}) {
  switch (type) {
    case 'global':
      return () => {
        const commands = EventManager.guidMap[eventId]
        const fn = !commands ? Command.skip : () => {
          Event.stack.push(CommandList, CommandIndex)
          CommandList = commands
          CommandIndex = 0
          return true
        }
        // 编译时不能确定事件已加载，因此使用运行时编译
        return (CommandList[CommandIndex - 1] = fn)()
      }
    case 'scene': {
      const type = Enum.getValue(eventType) || eventType
      return () => {
        Scene.binding?.callEvent(type)
        return true
      }
    }
    case 'actor': {
      const getActor = Command.compileActor(actor)
      const type = Enum.getValue(eventType) || eventType
      return () => (getActor()?.callEvent(type), true)
    }
    case 'skill': {
      const getSkill = Command.compileSkill(skill)
      const type = Enum.getValue(eventType) || eventType
      return () => (getSkill()?.callEvent(type), true)
    }
    case 'state': {
      const getState = Command.compileState(state)
      const type = Enum.getValue(eventType) || eventType
      return () => (getState()?.callEvent(type), true)
    }
    case 'equipment': {
      const getEquipment = Command.compileEquipment(equipment)
      const type = Enum.getValue(eventType) || eventType
      return () => (getEquipment()?.callEvent(type), true)
    }
    case 'item': {
      const getItem = Command.compileItem(item)
      const type = Enum.getValue(eventType) || eventType
      return () => (getItem()?.callEvent(type), true)
    }
    case 'light': {
      const getLight = Command.compileLight(light)
      const type = Enum.getValue(eventType) || eventType
      return () => (getLight()?.callEvent(type), true)
    }
    case 'element': {
      const getElement = Command.compileElement(element)
      const type = Enum.getValue(eventType) || eventType
      return () => (getElement()?.callEvent(type), true)
    }
  }
}

/**
 * 停止事件
 * @returns {Function}
 */
 Command.stopEvent = function () {
  return () => {
    Event.finish()
    return false
  }
}

/**
 * 设置事件
 * @param {Object} $
 * @param {string} $.operation
 * @param {VariableGetter} [$.variable]
 * @param {string} [$.eventId]
 * @param {number} [$.choiceIndex]
 * @returns {Function}
 */
Command.setEvent = function ({operation, variable, eventId, choiceIndex}) {
  switch (operation) {
    case 'stop-propagation':
      return () => {
        if (Event.bubble !== false) {
          Input.bubbles.stop()
        }
        return true
      }
    case 'prevent-scene-input-events':
      return () => {
        Scene.preventInput()
        return true
      }
    case 'restore-scene-input-events':
      return () => {
        Scene.restoreInput()
        return true
      }
    case 'pause': {
      const setter = Command.compileVariable(variable, Attribute.OBJECT_SET)
      return () => {
        setter(Event)
        return Event.pause()
      }
    }
    case 'continue': {
      const getter = Command.compileVariable(variable, Attribute.OBJECT_GET)
      const setter = Command.compileVariable(variable, Attribute.OBJECT_SET)
      return () => {
        const event = getter()
        if (event instanceof EventHandler) {
          event.continue()
          setter(undefined)
        }
        return true
      }
    }
    case 'enable':
      return () => {
        EventManager.enable(eventId)
        return true
      }
    case 'disable':
      return () => {
        EventManager.disable(eventId)
        return true
      }
    case 'highest-priority':
      return () => {
        EventManager.setToHighestPriority(eventId)
        return true
      }
    case 'goto-choice-branch': {
      const getIndex = Command.compileNumber(choiceIndex)
      return () => {
        Command.choiceIndex = getIndex()
        return true
      }
    }
  }
}

/**
 * 过渡
 * @param {Object} $
 * @param {VariableGetter} $.variable
 * @param {number|VariableGetter} $.start
 * @param {number|VariableGetter} $.end
 * @param {string} $.easingId
 * @param {number|VariableGetter} $.duration
 * @param {Array} $.commands
 * @returns {Function|null}
 */
Command.transition = function ({variable, start, end, easingId, duration, commands}) {
  if (commands.length === 0) {
    return null
  }
  const context = Command.stack.get()
  const nextCommands = context.commands
  const nextIndex = context.index + 1
  const getStart = Command.compileNumber(start)
  const getEnd = Command.compileNumber(end)
  const getDuration = Command.compileNumber(duration)
  const setNumber = Command.compileVariable(variable, Attribute.NUMBER_SET)
  const setVariable = () => {
    const transition = Event.transitions[0]
    transition.elapsed -= Event.timer.duration
    const {start, end, duration} = transition
    const easing = Easing.get(easingId)
    const time = easing.map(transition.elapsed / duration)
    const value = start * (1 - time) + end * time
    setNumber(value)
  }
  const checkLoopCond = () => {
    const {elapsed, duration} = Event.transitions[0]
    if (elapsed < duration) {
      CommandIndex = 0
      return Event.wait(0)
    } else {
      Event.transitions.shift()
      CommandList = nextCommands
      CommandIndex = nextIndex
      return true
    }
  }
  const loopCommands = Command.compile([setVariable, ...commands], checkLoopCond)
  return () => {
    const duration = getDuration()
    if (duration > 0) {
      if (!Event.transitions) {
        Event.transitions = []
      }
      Event.transitions.unshift({
        elapsed: 0,
        start: getStart(),
        end: getEnd(),
        duration: duration,
      })
      const timer = Event.getTimer()
      timer.duration = 0
      CommandList = loopCommands
      CommandIndex = 0
    }
    return true
  }
}

/**
 * 插入标签
 * @param {Object} $
 * @param {string} $.name
 * @returns {null}
 */
Command.label = function ({name}) {
  const {commands, index} = this.stack.get()
  this.labels[name] = {commands, index}
  return null
}

/**
 * 跳转到标签
 * @param {Object} $
 * @param {string} $.operation
 * @param {string} $.label
 * @returns {Function}
 */
Command.jumpTo = function ({operation, label}) {
  switch (operation) {
    case 'jump':
    case 'save-jump':
      const {commands, index} = this.stack.get()
      this.jumps.push({operation, label, commands, index})
      return Command.skip
    case 'return':
      return () => {
        const {savedCommands, savedIndex} = Event
        if (savedCommands !== undefined) {
          Event.savedCommands = undefined
          Event.savedIndex = undefined
          CommandList = savedCommands
          CommandIndex = savedIndex
        }
        return true
      }
  }
}

/**
 * 等待
 * @param {Object} $
 * @param {number|VariableGetter} $.duration
 * @returns {Function}
 */
Command.wait = function ({duration}) {
  switch (typeof duration) {
    case 'number':
      return () => Event.wait(duration)
    case 'object': {
      const getDuration = Command.compileNumber(duration)
      return () => Event.wait(getDuration())
    }
  }
}

/**
 * 创建元素
 * @param {Object} $
 * @param {string} $.operation
 * @param {ElementGetter} [$.parent]
 * @param {string} [$.uiId]
 * @param {string} [$.presetId]
 * @returns {Function}
 */
Command.createElement = function ({operation, parent, uiId, presetId}) {
  switch (operation) {
    case 'append-all-to-root':
      return () => {
        UI.root.appendChildren(UI.loadUI(uiId))
        return true
      }
    case 'append-one-to-root':
      return () => {
        try {UI.add(presetId)}
        catch (error) {console.warn(error)}
        return true
      }
    case 'append-all-to-element': {
      const getElement = Command.compileElement(parent)
      return () => {
        getElement()?.appendChildren(UI.loadUI(uiId))
        return true
      }
    }
    case 'append-one-to-element': {
      const getElement = Command.compileElement(parent)
      return () => {
        try {getElement()?.appendChild(UI.createElement(presetId))}
        catch (error) {console.warn(error)}
        return true
      }
    }
  }
}

/**
 * 设置图像
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setImage = function setImage({element, properties}) {
  if (!setImage.clipMap) {
    setImage.clipMap = {
      'clip-0': true,
      'clip-1': true,
      'clip-2': true,
      'clip-3': true,
    }
  }
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    if (typeof property.value === 'object') {
      property.value = Command.compileNumber(property.value)
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof ImageElement) {
      for (let {key, value} of properties) {
        if (typeof value === 'function') {
          value = value()
        }
        if (setImage.clipMap[key]) {
          element.clip[key[5]] = value
          continue
        }
        element[key] = value
      }
    }
    return true
  }
}

/**
 * 加载图像
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {string} $.type
 * @param {ActorGetter} [$.actor]
 * @param {SkillGetter} [$.skill]
 * @param {StateGetter} [$.state]
 * @param {EquipmentGetter} [$.equipment]
 * @param {ItemGetter} [$.item]
 * @param {string|VariableGetter} [$.key]
 * @param {VariableGetter} [$.variable]
 * @returns {Function}
 */
Command.loadImage = function loadImage({element, type, actor, skill, state, equipment, item, key, variable}) {
  let {setImageClip} = loadImage
  if (!setImageClip) {
    setImageClip = loadImage.setImageClip = (element, object) => {
      if (element instanceof ImageElement && object) {
        element.setImageClip(object.icon ?? object.portrait, object.clip)
        element.resize()
      }
    }
  }
  const getElement = Command.compileElement(element)
  switch (type) {
    case 'actor-portrait': {
      const getActor = Command.compileActor(actor)
      return () => {
        setImageClip(getElement(), getActor())
        return true
      }
    }
    case 'skill-icon': {
      const getSkill = Command.compileSkill(skill)
      return () => {
        setImageClip(getElement(), getSkill())
        return true
      }
    }
    case 'state-icon': {
      const getState = Command.compileState(state)
      return () => {
        setImageClip(getElement(), getState())
        return true
      }
    }
    case 'equipment-icon': {
      const getEquipment = Command.compileEquipment(equipment)
      return () => {
        setImageClip(getElement(), getEquipment())
        return true
      }
    }
    case 'item-icon': {
      const getItem = Command.compileItem(item)
      return () => {
        setImageClip(getElement(), getItem())
        return true
      }
    }
    case 'shortcut-icon': {
      const getActor = Command.compileActor(actor)
      const getKey = Command.compileEnumValue(key)
      return () => {
        setImageClip(getElement(), getActor()?.shortcutManager.get(getKey()))
        return true
      }
    }
    case 'base64': {
      const getBase64 = Command.compileVariable(variable, Attribute.STRING_GET)
      return () => {
        const base64 = getBase64()
        const element = getElement()
        if (typeof base64 === 'string' && element instanceof ImageElement) {
          if (GL.textureManager.images[base64]) {
            element.image = base64
          } else {
            const image = new Image()
            image.onload = () => {
              image.guid = base64
              element.image = image
            }
            image.src = base64
          }
        }
        return true
      }
    }
  }
}

/**
 * 改变图像色调
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {string} $.mode
 * @param {Array<number>} $.tint
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.tintImage = function ({element, mode, tint, easingId, duration, wait}) {
  const getElement = Command.compileElement(element)
  const tintProps = {}
  switch (mode) {
    case 'full':
      tintProps.red = tint[0]
      tintProps.green = tint[1]
      tintProps.blue = tint[2]
      tintProps.gray = tint[3]
      break
    case 'rgb':
      tintProps.red = tint[0]
      tintProps.green = tint[1]
      tintProps.blue = tint[2]
      break
    case 'gray':
      tintProps.gray = tint[3]
      break
  }
  return () => {
    const element = getElement()
    if (element instanceof ImageElement) {
      element.setTint(tintProps, easingId, duration)
      if (wait && duration > 0) {
        return Event.wait(duration)
      }
    }
    return true
  }
}

/**
 * 设置文本
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setText = function ({element, properties}) {
  const getElement = Command.compileElement(element)
  const variables = []
  const constants = []
  for (const property of properties) {
    switch (property.key) {
      case 'content': {
        const getter = Command.compileTextContent(property.value)
        if (!getter.constant) {
          variables.push({
            key: property.key,
            value: getter,
          })
          continue
        }
        // 如果内容是常量，进入默认分支
      }
      default:
        constants.push(property)
        continue
    }
  }
  // 对单属性变量进行优化
  if (variables.length === 1 && constants.length === 0) {
    const {key, value} = variables[0]
    return () => {
      const element = getElement()
      if (element instanceof TextElement) {
        element[key] = value()
      }
      return true
    }
  }
  // 对单属性常量进行优化
  if (variables.length === 0 && constants.length === 1) {
    const {key, value} = constants[0]
    return () => {
      const element = getElement()
      if (element instanceof TextElement) {
        element[key] = value
      }
      return true
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof TextElement) {
      for (const property of variables) {
        element[property.key] = property.value()
      }
      for (const property of constants) {
        element[property.key] = property.value
      }
    }
    return true
  }
}

/**
 * 设置文本框
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setTextBox = function ({element, properties}) {
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    switch (property.key) {
      case 'text':
        if (typeof property.value === 'object') {
          property.value = Command.compileString(property.value)
        }
        continue
      case 'number':
      case 'min':
      case 'max':
        if (typeof property.value === 'object') {
          property.value = Command.compileNumber(property.value)
        }
        continue
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof TextBoxElement) {
      for (let {key, value} of properties) {
        if (typeof value === 'function') {
          value = value()
        }
        element[key] = value
      }
    }
    return true
  }
}

/**
 * 设置对话框
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setDialogBox = function ({element, properties}) {
  const getElement = Command.compileElement(element)
  const variables = []
  const constants = []
  for (const property of properties) {
    switch (property.key) {
      case 'content': {
        const getter = Command.compileTextContent(property.value)
        if (!getter.constant) {
          variables.push({
            key: property.key,
            value: getter,
          })
          continue
        }
        // 如果内容是常量，进入默认分支
      }
      default:
        constants.push(property)
        continue
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof DialogBoxElement) {
      for (const property of variables) {
        element[property.key] = property.value()
      }
      for (const property of constants) {
        element[property.key] = property.value
      }
    }
    return true
  }
}

/**
 * 控制对话框
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {string} $.operation
 * @returns {Function}
 */
Command.controlDialog = function controlDialog({element, operation}) {
  if (!controlDialog.methodMap) {
    controlDialog.methodMap = {
      'pause': 'pause',
      'continue': 'continue',
      'print-immediately': 'printImmediately',
      'print-next-page': 'printNextPage',
    }
  }
  const getElement = Command.compileElement(element)
  const methodName = controlDialog.methodMap[operation]
  return () => {
    const element = getElement()
    if (element instanceof DialogBoxElement) {
      element[methodName]()
    }
    return true
  }
}

/**
 * 设置进度条
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setProgressBar = function setProgressBar({element, properties}) {
  if (!setProgressBar.initialized) {
    setProgressBar.initialized = true
    setProgressBar.clipMap = {
      'clip-0': true,
      'clip-1': true,
      'clip-2': true,
      'clip-3': true,
    }
    setProgressBar.colorMap = {
      'color-0': true,
      'color-1': true,
      'color-2': true,
      'color-3': true,
    }
  }
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    if (typeof property.value === 'object') {
      property.value = Command.compileNumber(property.value)
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof ProgressBarElement) {
      for (let {key, value} of properties) {
        if (typeof value === 'function') {
          value = value()
        }
        if (setProgressBar.clipMap[key]) {
          element.clip[key[5]] = value
          continue
        }
        if (setProgressBar.colorMap[key]) {
          element.color[key[6]] = value
          continue
        }
        element[key] = value
      }
    }
    return true
  }
}

/**
 * 设置按钮
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setButton = function setButton({element, properties}) {
  if (!setButton.initialized) {
    setButton.initialized = true
    setButton.arrayMap = {
      'normalClip': true,
      'hoverClip': true,
      'activeClip': true,
      'normalTint': true,
      'hoverTint': true,
      'activeTint': true,
    }
  }
  const getElement = Command.compileElement(element)
  const variables = []
  const constants = []
  for (const property of properties) {
    switch (property.key) {
      case 'content': {
        const getter = Command.compileTextContent(property.value)
        if (!getter.constant) {
          variables.push({
            key: property.key,
            value: getter,
          })
          continue
        }
        // 如果内容是常量，进入默认分支
      }
      default:
        constants.push(property)
        continue
    }
  }
  // 对单属性变量进行优化
  if (variables.length === 1 && constants.length === 0) {
    const {key, value} = variables[0]
    return () => {
      const element = getElement()
      if (element instanceof ButtonElement) {
        element[key] = value()
      }
      return true
    }
  }
  // 对单属性常量进行优化
  if (variables.length === 0 && constants.length === 1) {
    const {key, value} = constants[0]
    return () => {
      const element = getElement()
      if (element instanceof ButtonElement) {
        if (setButton.arrayMap[key]) {
          element[key].set(value)
        } else {
          element[key] = value
        }
      }
      return true
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof ButtonElement) {
      for (const property of variables) {
        element[property.key] = property.value()
      }
      for (const property of constants) {
        if (element instanceof ButtonElement) {
          if (setButton.arrayMap[property.key]) {
            element[property.key].set(property.value)
          } else {
            element[property.key] = property.value
          }
        }
      }
    }
    return true
  }
}

/**
 * 控制按钮
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {string} $.operation
 * @returns {Function}
 */
Command.controlButton = function ({element, operation}) {
  switch (operation) {
    case 'select-default':
      return () => {
        UI.selectDefaultButton()
        return true
      }
  }
  const getElement = Command.compileElement(element)
  return () => {
    const element = getElement()
    if (element instanceof ButtonElement) {
      switch (operation) {
        case 'select':
          UI.selectButton(element)
          break
        case 'hover-mode':
          element.mode = 'hover'
          break
        case 'active-mode':
          element.mode = 'active'
          break
        case 'normal-mode':
          element.mode = 'normal'
          break
      }
    }
    return true
  }
}

/**
 * 设置窗口
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setAnimation = function ({element, properties}) {
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    switch (property.key) {
      case 'animation-from-actor':
        property.value = Command.compileActor(property.value)
        continue
      case 'motion':
        property.value = Enum.getValue(property.value)
        continue
      case 'angle':
      case 'frame':
        if (typeof property.value === 'object') {
          property.value = Command.compileNumber(property.value, 0, 0, 10000)
        }
        continue
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof AnimationElement) {
      for (let {key, value} of properties) {
        switch (key) {
          case 'animation-from-actor': {
            const actor = value()
            if (actor instanceof Actor) {
              element.loadActorAnimation(actor)
            }
            continue
          }
          default:
            if (typeof value === 'function') {
              value = value()
            }
            element[key] = value
            continue
        }
      }
    }
    return true
  }
}

/**
 * 设置视频
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setVideo = function setVideo({element, properties}) {
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    switch (property.key) {
      case 'playbackRate':
        if (typeof property.value === 'object') {
          property.value = Command.compileNumber(property.value, 0, 0, 4)
        }
        break
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof VideoElement) {
      for (let {key, value} of properties) {
        if (typeof value === 'function') {
          value = value()
        }
        element[key] = value
      }
    }
    return true
  }
}

/**
 * 设置窗口
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {Object[]} $.properties
 * @returns {Function}
 */
Command.setWindow = function ({element, properties}) {
  const getElement = Command.compileElement(element)
  for (const property of properties) {
    switch (property.key) {
      case 'scrollX':
      case 'scrollY':
      case 'gridWidth':
      case 'gridHeight':
      case 'gridGapX':
      case 'gridGapY':
      case 'paddingX':
      case 'paddingY':
        if (typeof property.value === 'object') {
          property.value = Command.compileNumber(property.value, 0, 0, 10000)
        }
        continue
    }
  }
  return () => {
    const element = getElement()
    if (element instanceof WindowElement) {
      for (let {key, value} of properties) {
        if (typeof value === 'function') {
          value = value()
        }
        element[key] = value
      }
    }
    return true
  }
}

/**
 * 等待视频结束
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @returns {Function}
 */
Command.waitForVideo = function ({element}) {
  const getElement = Command.compileElement(element)
  return () => {
    const element = getElement()
    if (element instanceof VideoElement && element.state !== 'ended') {
      const event = Event
      element.onEnded(() => {
        event.continue()
      })
      return Event.pause()
    }
    return true
  }
}

/**
 * 设置元素
 * @param {Object} $
 * @param {ElementGetter} $.element
 * @param {string} $.operation
 * @returns {Function}
 */
Command.setElement = function ({element, operation}) {
  const getElement = Command.compileElement(element)
  switch (operation) {
    case 'hide':
      return () => {
        getElement()?.hide()
        return true
      }
    case 'show':
      return () => {
        getElement()?.show()
        return true
      }
    case 'disable-pointer-events':
      return () => {
        const element = getElement()
        if (element) {
          element.pointerEvents = 'disabled'
        }
        return true
      }
    case 'enable-pointer-events':
      return () => {
        const element = getElement()
        if (element) {
          element.pointerEvents = 'enabled'
        }
        return true
      }
    case 'skip-pointer-events':
      return () => {
        const element = getElement()
        if (element) {
          element.pointerEvents = 'skipped'
        }
        return true
      }
    case 'move-to-first':
      return () => {
        getElement()?.moveToIndex(0)
        return true
      }
    case 'move-to-last':
      return () => {
        getElement()?.moveToIndex(-1)
        return true
      }
  }
}

/**
 * 嵌套元素
 * @param {Object} $
 * @param {ElementGetter} $.parent
 * @param {ElementGetter} $.child
 * @returns {Function}
 */
Command.nestElement = function ({parent, child}) {
  const getParent = Command.compileElement(parent)
  const getChild = Command.compileElement(child)
  return () => {
    const parent = getParent()
    const child = getChild()
    if (parent && child && parent !== child) {
      child.remove()
      parent.appendChild(child)
    }
    return true
  }
}

/** 移动元素 */
Command.moveElement = function moveElement(IIFE) {
  const compileProperties = properties => {
    const propMap = {}
    for (const property of properties) {
      if (typeof property.value === 'object') {
        const length = properties.length
        const keys = new Array(length)
        const getters = new Array(length)
        for (let i = 0; i < length; i++) {
          const {key, value} = properties[i]
          keys[i] = key
          getters[i] = Command.compileNumber(value)
        }
        return () => {
          for (let i = 0; i < length; i++) {
            propMap[keys[i]] = getters[i]()
          }
          return propMap
        }
      }
    }
    for (const {key, value} of properties) {
      propMap[key] = value
    }
    return () => propMap
  }
  /**
   * 移动元素
   * @param {Object} $
   * @param {ElementGetter} $.element
   * @param {Object[]} $.properties
   * @param {string} $.easingId
   * @param {number} $.duration
   * @param {boolean} $.wait
   * @returns {Function}
   */
  return function ({element, properties, easingId, duration, wait}) {
    const getElement = Command.compileElement(element)
    const getPropMap = compileProperties(properties)
    return () => {
      const element = getElement()
      if (element) {
        element.move(getPropMap(), easingId, duration)
        if (wait && duration > 0) {
          return Event.wait(duration)
        }
      }
      return true
    }
  }
}()

/**
 * 删除元素
 * @param {Object} $
 * @param {string} $.operation
 * @param {ElementGetter} $.element
 * @returns {Function}
 */
Command.deleteElement = function ({operation, element}) {
  switch (operation) {
    case 'delete-element': {
      const getElement = Command.compileElement(element)
      return () => {
        getElement()?.destroy()
        return true
      }
    }
    case 'delete-children': {
      const getElement = Command.compileElement(element)
      return () => {
        getElement()?.clear()
        return true
      }
    }
    case 'delete-all':
      return () => {
        UI.reset()
        return true
      }
  }
}

/**
 * 设置指针事件根元素
 * @param {Object} $
 * @param {string} $.operation
 * @param {ElementGetter} [$.element]
 * @returns {Function}
 */
Command.setPointerEventRoot = function ({operation, element}) {
  // 补丁：2023-3-19
  if (operation === 'set') {
    operation = 'add'
  }
  switch (operation) {
    case 'add': {
      const getElement = Command.compileElement(element)
      return () => {
        const element = getElement()
        if (element) {
          UI.addPointerEventRoot(element)
        }
        return true
      }
    }
    case 'remove': {
      const getElement = Command.compileElement(element)
      return () => {
        const element = getElement()
        if (element) {
          UI.removePointerEventRoot(element)
        }
        return true
      }
    }
    case 'remove-latest':
      return () => {
        UI.removeLatestPointerEventRoot()
        return true
      }
    case 'reset':
      return () => {
        UI.resetPointerEventRoots()
        return true
      }
  }
}

/**
 * 设置焦点
 * @param {Object} $
 * @param {string} $.operation
 * @param {ElementGetter} [$.element]
 * @param {string} [$.mode]
 * @param {boolean} [$.cancelable]
 * @returns {Function}
 */
Command.setFocus = function ({operation, element, mode, cancelable}) {
  switch (operation) {
    case 'add': {
      // 补丁：2023-3-21
      if (mode === undefined) {
        mode = 'control-child-buttons'
      }
      const getElement = Command.compileElement(element)
      return () => {
        const element = getElement()
        if (element) {
          element.focusMode = mode
          element.focusCancelable = cancelable
          UI.addFocus(element)
        }
        return true
      }
    }
    case 'remove': {
      const getElement = Command.compileElement(element)
      return () => {
        const element = getElement()
        if (element) {
          UI.removeFocus(element)
        }
        return true
      }
    }
    case 'remove-latest':
      return () => {
        UI.removeLatestFocus()
        return true
      }
    case 'reset':
      return () => {
        UI.resetFocuses()
        return true
      }
  }
}

/**
 * 创建光源
 * @param {Object} $
 * @param {string} $.presetId
 * @param {PositionGetter} $.position
 * @returns {Function}
 */
Command.createLight = function ({presetId, position}) {
  const getPoint = Command.compilePosition(position)
  return () => {
    if (Scene.binding !== null) {
      const preset = Scene.lights.presets[presetId]
      const point = getPoint(preset)
      if (preset && point) {
        const light = new SceneLight(preset)
        light.x = point.x
        light.y = point.y
        Scene.lights.append(light)
      }
    }
    return true
  }
}

/** 移动光源 */
Command.moveLight = function moveLight(IIFE) {
  const ranges = {
    range: [0, 128],
    intensity: [0, 1],
    anchorX: [0, 1],
    anchorY: [0, 1],
    width: [0, 128],
    height: [0, 128],
    red: [0, 255],
    green: [0, 255],
    blue: [0, 255],
  }
  const compileProperties = properties => {
    const propMap = {}
    for (const property of properties) {
      if (typeof property.value === 'object') {
        const length = properties.length
        const keys = new Array(length)
        const getters = new Array(length)
        for (let i = 0; i < length; i++) {
          const {key, value} = properties[i]
          const range = ranges[key] ?? Array.empty
          keys[i] = key
          getters[i] = Command.compileNumber(value, 0, ...range)
        }
        return () => {
          for (let i = 0; i < length; i++) {
            propMap[keys[i]] = getters[i]()
          }
          return propMap
        }
      }
    }
    for (const {key, value} of properties) {
      propMap[key] = value
    }
    return () => propMap
  }
  /**
   * 移动光源
   * @param {Object} $
   * @param {LightGetter} $.light
   * @param {Object[]} $.properties
   * @param {string} $.easingId
   * @param {number} $.duration
   * @param {boolean} $.wait
   * @returns {Function}
   */
  return function ({light, properties, easingId, duration, wait}) {
    const getLight = Command.compileLight(light)
    const getPropMap = compileProperties(properties)
    return () => {
      const light = getLight()
      if (light) {
        light.move(getPropMap(), easingId, duration)
        if (wait && duration > 0) {
          return Event.wait(duration)
        }
      }
      return true
    }
  }
}()

/**
 * 删除光源
 * @param {Object} $
 * @param {LightGetter} $.light
 * @returns {Function}
 */
Command.deleteLight = function ({light}) {
  const getLight = Command.compileLight(light)
  return () => {
    const light = getLight()
    if (light) {
      Callback.push(() => {
        light.destroy()
        Scene.lights.remove(light)
      })
    }
    return true
  }
}

/**
 * 设置状态
 * @param {Object} $
 * @param {StateGetter} $.state
 * @param {string} $.operation
 * @param {number|VariableGetter} $.time
 * @returns {Function}
 */
Command.setState = function ({state, operation, time}) {
  const getState = Command.compileState(state)
  const getTime = Command.compileNumber(time)
  switch (operation) {
    case 'set-time':
      return () => {
        getState()?.setTime(getTime())
        return true
      }
    case 'increase-time':
      return () => {
        getState()?.increaseTime(getTime())
        return true
      }
    case 'decrease-time':
      return () => {
        getState()?.decreaseTime(getTime())
        return true
      }
  }
}

/**
 * 播放动画
 * @param {Object} $
 * @param {string} $.mode
 * @param {PositionGetter} [$.position]
 * @param {ActorGetter} [$.actor]
 * @param {string} $.animationId
 * @param {string} $.motion
 * @param {boolean} $.rotatable
 * @param {number} $.priority
 * @param {number} $.offsetY
 * @param {number|VariableGetter} $.angle
 * @param {number|VariableGetter} $.speed
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.playAnimation = function ({mode, position, actor, animationId, motion, rotatable, priority, offsetY, angle, speed, wait}) {
  let getPoint
  switch (mode) {
    case 'position':
      getPoint = Command.compilePosition(position)
      break
    case 'actor':
      getPoint = Command.compileActor(actor)
      break
  }
  const getAngle = Command.compileNumber(angle)
  const getSpeed = Command.compileNumber(speed, 1, 0.1, 10)
  const data = Data.animations[animationId]
  const motionName = Enum.getValue(motion)
  return !data ? null : () => {
    const point = getPoint()
    if (point) {
      const animation = new Animation(data)
      if (mode === 'position') {
        animation.setPosition({x: point.x, y: point.y})
      } else {
        animation.setPosition(point)
      }
      if (animation.setMotion(motionName)) {
        animation.rotatable = rotatable
        animation.priority = priority
        animation.offsetY = offsetY
        animation.speed = getSpeed()
        animation.setAngle(Math.radians(getAngle()))
        animation.onFinish(() => {
          animation.destroy()
          Callback.push(() => {
            Scene.animations.remove(animation)
          })
        })
        Scene.animations.append(animation)
        if (wait) {
          const event = Event
          animation.onFinish(() => {
            event.continue()
          })
          return Event.pause()
        }
      }
    }
    return true
  }
}

/**
 * 播放音频
 * @param {Object} $
 * @param {string} $.type
 * @param {string} $.audio
 * @param {number} $.volume
 * @returns {Function}
 */
Command.playAudio = function ({type, audio, volume, location}) {
  switch (type) {
    case 'se-attenuated': {
      const getLocation = Command.compilePosition(location)
      return () => {
        const location = getLocation()
        if (location) {
          AudioManager.se.playAt(audio, location, volume)
        }
        return true
      }
    }
    default:
      return () => {
        AudioManager[type].play(audio, volume)
        return true
      }
  }
}

/**
 * 停止播放音频
 * @param {Object} $
 * @param {string} $.type
 * @returns {Function}
 */
Command.stopAudio = function ({type}) {
  switch (type) {
    case 'all':
      return () => {
        AudioManager.bgm.stop()
        AudioManager.bgs.stop()
        AudioManager.cv.stop()
        AudioManager.se.stop()
        return true
      }
    default:
      return () => {
        AudioManager[type].stop()
        return true
      }
  }
}

/**
 * 设置音量
 * @param {Object} $
 * @param {string} $.type
 * @param {number|VariableGetter} $.volume
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setVolume = function ({type, volume, easingId, duration, wait}) {
  const getVolume = Command.compileNumber(volume, 0, 0, 1)
  return () => {
    AudioManager[type].setVolume(getVolume(), easingId, duration)
    if (wait && duration > 0) {
      return Event.wait(duration)
    }
    return true
  }
}

/**
 * 设置声像
 * @param {Object} $
 * @param {string} $.type
 * @param {number|VariableGetter} $.pan
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setPan = function ({type, pan, easingId, duration, wait}) {
  const getPan = Command.compileNumber(pan, 0, -1, 1)
  return () => {
    AudioManager[type].setPan(getPan(), easingId, duration)
    if (wait && duration > 0) {
      return Event.wait(duration)
    }
    return true
  }
}

/**
 * 设置混响
 * @param {Object} $
 * @param {string} $.type
 * @param {number} $.dry
 * @param {number} $.wet
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setReverb = function ({type, dry, wet, easingId, duration, wait}) {
  const getDry = Command.compileNumber(dry, 0, 0, 1)
  const getWet = Command.compileNumber(wet, 0, 0, 1)
  return () => {
    AudioManager[type].setReverb(getDry(), getWet(), easingId, duration)
    if (wait && duration > 0) {
      return Event.wait(duration)
    }
    return true
  }
}

/**
 * 设置循环
 * @param {Object} $
 * @param {string} $.type
 * @param {boolean} $.loop
 * @returns {Function}
 */
Command.setLoop = function ({type, loop}) {
  return () => {
    AudioManager[type].setLoop(loop)
    return true
  }
}

/**
 * 保存音频
 * @param {Object} $
 * @param {string} $.type
 * @returns {Function}
 */
Command.saveAudio = function ({type}) {
  return () => {
    AudioManager[type].save()
    return true
  }
}

/**
 * 恢复音频
 * @param {Object} $
 * @param {string} $.type
 * @returns {Function}
 */
Command.restoreAudio = function ({type}) {
  return () => {
    AudioManager[type].restore()
    return true
  }
}

/**
 * 创建角色
 * @param {Object} $
 * @param {string} $.actorId
 * @param {string} $.teamId
 * @param {PositionGetter} $.position
 * @param {number|VariableGetter} $.angle
 * @returns {Function}
 */
Command.createActor = function ({actorId, teamId, position, angle}) {
  const getPoint = Command.compilePosition(position)
  const getDegrees = Command.compileNumber(angle)
  const data = Data.actors[actorId]
  return !data ? null : () => {
    if (Scene.binding !== null) {
      const point = getPoint()
      if (point) {
        const actor = new Actor(data)
        actor.setTeam(teamId)
        actor.setPosition(point.x, point.y)
        actor.updateAngle(Math.radians(getDegrees()))
        Scene.actors.append(actor)
      }
    }
    return true
  }
}

/**
 * 移动角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.mode
 * @param {number|VariableGetter} [$.angle]
 * @param {PositionGetter} [$.destination]
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.moveActor = function ({actor, mode, angle, destination, wait}) {
  const getActor = Command.compileActor(actor)
  switch (mode) {
    case 'stop':
      return () => {
        getActor()?.navigator.stopMoving()
        return true
      }
    case 'keep': {
      const {radians} = Math
      const getDegrees = Command.compileNumber(angle)
      return () => {
        getActor()?.navigator.moveTowardAngle(radians(getDegrees()))
        return true
      }
    }
    case 'straight': {
      const getPoint = Command.compilePosition(destination)
      return () => {
        const actor = getActor()
        const point = getPoint(actor)
        if (actor && point) {
          actor.navigator.moveTo(point.x, point.y)
          if (wait) {
            const event = Event
            actor.navigator.onFinish(() => {
              event.continue()
            })
            return Event.pause()
          }
        }
        return true
      }
    }
    case 'navigate':
    case 'navigate-bypass': {
      const getPoint = Command.compilePosition(destination)
      const bypass = mode === 'navigate-bypass'
      return () => {
        const actor = getActor()
        const point = getPoint(actor)
        if (Scene.binding !== null && actor && point) {
          actor.navigator.navigateTo(point.x, point.y, bypass)
          if (wait) {
            const event = Event
            actor.navigator.onFinish(() => {
              event.continue()
            })
            return Event.pause()
          }
        }
        return true
      }
    }
    case 'teleport': {
      const getPoint = Command.compilePosition(destination)
      return () => {
        const actor = getActor()
        const point = getPoint(actor)
        if (actor && point) {
          actor.setPosition(point.x, point.y)
        }
        return true
      }
    }
  }
}

/**
 * 跟随角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {ActorGetter} $.target
 * @param {string} $.mode
 * @param {number} $.minDist
 * @param {number} $.maxDist
 * @param {number} [$.offset]
 * @param {number} [$.vertDist]
 * @param {boolean} $.navigate
 * @param {boolean} [$.bypass]
 * @param {boolean} $.once
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.followActor = function ({actor, target, mode, minDist, maxDist, offset, vertDist, navigate, bypass, once, wait}) {
  // 补丁：2023-1-30
  bypass = bypass ?? false
  const getActor = Command.compileActor(actor)
  const getTarget = Command.compileActor(target)
  const getMinDist = Command.compileNumber(minDist)
  const getMaxDist = Command.compileNumber(maxDist)
  switch (mode) {
    case 'circle':
      return () => {
        const actor = getActor()
        const target = getTarget()
        if (actor && target && actor !== target) {
          actor.navigator.followCircle(target, getMinDist(), getMaxDist(), offset, navigate, bypass, once)
          if (wait) {
            const event = Event
            actor.navigator.onFinish(() => {
              event.continue()
            })
            return Event.pause()
          }
        }
        return true
      }
    case 'rectangle':
      return () => {
        const actor = getActor()
        const target = getTarget()
        if (actor && target && actor !== target) {
          actor.navigator.followRectangle(target, getMinDist(), getMaxDist(), vertDist, navigate, bypass, once)
          if (wait) {
            const event = Event
            actor.navigator.onFinish(() => {
              event.continue()
            })
            return Event.pause()
          }
        }
        return true
      }
  }
}

/**
 * 平移角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {AngleGetter} $.angle
 * @param {number|VariableGetter} $.distance
 * @param {string} $.easingId
 * @param {number|VariableGetter} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.translateActor = function ({actor, angle, distance, easingId, duration, wait}) {
  const getActor = Command.compileActor(actor)
  const getAngle = Command.compileAngle(angle)
  const getDistance = Command.compileNumber(distance)
  const getDuration = Command.compileNumber(duration)
  return () => {
    const actor = getActor()
    if (actor) {
      const radians = getAngle(actor)
      const distance = getDistance()
      const duration = getDuration()
      actor.translate(radians, distance, easingId, duration)
      if (wait && duration > 0) {
        return Event.wait(duration)
      }
    }
    return true
  }
}

/**
 * 增减仇恨值
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {ActorGetter} $.target
 * @param {string} $.operation
 * @param {number|VariableGetter} $.threat
 * @returns {Function}
 */
Command.changeThreat = function changeThreat({actor, target, operation, threat}) {
  if (!changeThreat.operationMap) {
    changeThreat.operationMap = {
      increase: 'increaseThreat',
      decrease: 'decreaseThreat',
    }
  }
  const OP = changeThreat.operationMap[operation]
  const getActor = Command.compileActor(actor)
  const getTarget = Command.compileActor(target)
  const getThreat = Command.compileNumber(threat)
  return () => {
    const actor = getActor()
    const target = getTarget()
    const threat = getThreat()
    if (actor && target && actor !== target && threat > 0) {
      actor.targetManager[OP](target, threat)
    }
    return true
  }
}

/**
 * 设置体重
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {number|VariableGetter} $.weight
 * @returns {Function}
 */
Command.setWeight = function ({actor, weight}) {
  const getActor = Command.compileActor(actor)
  const getWeight = Command.compileNumber(weight, 0, 0, 8)
  return () => {
    getActor()?.collider.setWeight(getWeight())
    return true
  }
}

/**
 * 设置移动速度
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.property
 * @param {number|VariableGetter} $.base
 * @param {number|VariableGetter} $.factor
 * @returns {Function}
 */
Command.setMovementSpeed = function ({actor, property, base, factor}) {
  const getActor = Command.compileActor(actor)
  switch (property) {
    case 'base': {
      const getBase = Command.compileNumber(base, 0, 0, 32)
      return () => {
        getActor()?.navigator.setMovementSpeed(getBase())
        return true
      }
    }
    case 'factor': {
      const getFactor = Command.compileNumber(factor, 0, 0, 4)
      return () => {
        getActor()?.navigator.setMovementFactor(getFactor())
        return true
      }
    }
    case 'factor-temp': {
      const getFactor = Command.compileNumber(factor, 0, 0, 4)
      return () => {
        getActor()?.navigator.setMovementFactorTemp(getFactor())
        return true
      }
    }
  }
}

/**
 * 设置角度
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {AngleGetter} $.angle
 * @param {string} $.easingId
 * @param {number|VariableGetter} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setAngle = function ({actor, angle, easingId, duration, wait}) {
  const getActor = Command.compileActor(actor)
  const getAngle = Command.compileAngle(angle)
  const getDuration = Command.compileNumber(duration)
  return () => {
    const actor = getActor()
    if (actor) {
      const radians = getAngle(actor)
      const duration = getDuration()
      actor.setAngle(radians, easingId, duration)
      if (wait && duration > 0) {
        return Event.wait(duration)
      }
    }
    return true
  }
}

/**
 * 固定角度
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {boolean} $.fixed
 * @returns {Function}
 */
Command.fixAngle = function ({actor, fixed}) {
  const getActor = Command.compileActor(actor)
  return () => {
    const actor = getActor()
    if (actor) {
      actor.angleFixed = fixed
    }
    return true
  }
}

/**
 * 设置激活状态
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {boolean} $.active
 * @returns {Function}
 */
Command.setActive = function ({actor, active}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.setActive(active)
    return true
  }
}

/**
 * 获取角色
 * @param {Object} $
 * @param {VariableGetter} $.variable
 * @param {PositionGetter} $.position
 * @param {string} $.area
 * @param {number} [$.size]
 * @param {number} [$.radius]
 * @param {string} $.selector
 * @param {string} [$.teamId]
 * @param {string} $.condition
 * @param {string} [$.attribute]
 * @param {string} [$.divisor]
 * @param {string} $.activation
 * @param {string} $.exclusion
 * @param {ActorGetter} [$.exclusionActor]
 * @param {string} [$.exclusionTeamId]
 * @param {boolean} [$.active]
 * @returns {Function}
 */
Command.getActor = function ({variable, position, area, size, radius, selector, teamId,
  condition, attribute, divisor, activation, exclusion, exclusionActor, exclusionTeamId, active}) {
  // 补丁：2023-1-7
  switch (selector) {
    case 'team-enemy':
      selector = 'enemy'
      break
    case 'team-friend':
      selector = 'friend'
      break
    case 'team-member':
      selector = 'team'
      break
  }
  switch (active) {
    case true:
      activation = 'active'
      break
    case false:
      activation = 'either'
      break
  }
  condition = condition ?? 'nearest'
  exclusion = exclusion ?? 'none'
  const setActor = Command.compileVariable(variable, Attribute.OBJECT_SET)
  const getPoint = Command.compilePosition(position)
  let getSize
  let getRadius
  let getTeamId
  let getExclusionActor
  let getExclusionTeamId
  if (teamId) {
    getTeamId = Command.compileString(teamId)
  }
  switch (area) {
    case 'square':
      getSize = Command.compileNumber(size, 0, 0, 512)
      break
    case 'circle':
      getRadius = Command.compileNumber(radius, 0, 0, 256)
      break
  }
  switch (exclusion) {
    case 'actor':
      getExclusionActor = Command.compileActor(exclusionActor)
      break
    case 'team':
      getExclusionTeamId = Command.compileString(exclusionTeamId)
      break
  }
  if (attribute) attribute = Attribute.getKey(attribute)
  if (divisor) divisor = Attribute.getKey(divisor)
  return () => {
    const point = getPoint()
    if (point) {
      setActor(Scene.binding?.getActor({
        x: point.x,
        y: point.y,
        area,
        size: getSize?.(),
        radius: getRadius?.(),
        selector,
        teamId: getTeamId?.(),
        condition,
        attribute,
        divisor,
        activation,
        exclusionActor: getExclusionActor?.(),
        exclusionTeamId: getExclusionTeamId?.(),
      }))
    }
    return true
  }
}

/**
 * 获取多个角色
 * @param {Object} $
 * @param {VariableGetter} $.variable
 * @param {PositionGetter} $.position
 * @param {string} $.area
 * @param {number} [$.width]
 * @param {number} [$.height]
 * @param {number} [$.radius]
 * @param {string} $.selector
 * @param {string} [$.teamId]
 * @param {string} $.activation
 * @returns {Function}
 */
Command.getMultipleActors = function ({variable, position, area, width, height, radius, selector, teamId, activation}) {
  const setActor = Command.compileVariable(variable, Attribute.OBJECT_SET)
  const getPoint = Command.compilePosition(position)
  let getWidth
  let getHeight
  let getRadius
  let getTeamId
  if (teamId) {
    getTeamId = Command.compileString(teamId)
  }
  switch (area) {
    case 'rectangle':
      getWidth = Command.compileNumber(width, 0, 0, 512)
      getHeight = Command.compileNumber(height, 0, 0, 512)
      break
    case 'circle':
      getRadius = Command.compileNumber(radius, 0, 0, 256)
      break
  }
  return () => {
    const point = getPoint()
    if (point) {
      setActor(Scene.binding?.getMultipleActors({
        x: point.x,
        y: point.y,
        area,
        width: getWidth?.(),
        height: getHeight?.(),
        radius: getRadius?.(),
        selector,
        teamId: getTeamId?.(),
        activation,
      }))
    }
    return true
  }
}

/**
 * 删除角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @returns {Function}
 */
Command.deleteActor = function ({actor}) {
  const getActor = Command.compileActor(actor)
  return () => {
    const actor = getActor()
    if (actor) {
      Callback.push(() => {
        actor.destroy()
      })
    }
    return true
  }
}

/**
 * 设置玩家角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @returns {Function}
 */
 Command.setPlayerActor = function ({actor}) {
  const getActor = Command.compileActor(actor)
  return () => {
    Party.setPlayer(getActor())
    return true
  }
}

/**
 * 设置队伍成员
 * @param {Object} $
 * @param {string} $.operation
 * @param {ActorGetter} $.actor
 * @returns {Function}
 */
 Command.setPartyMember = function ({operation, actor}) {
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'add':
      return () => {
        if (Party.members.length < 4) {
          Party.addMember(getActor())
        }
        return true
      }
    case 'remove':
      return () => {
        Party.removeMember(getActor())
        return true
      }
  }
}

/**
 * 改变通行区域
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.passage
 * @returns {Function}
 */
Command.changePassableTerrain = function ({actor, passage}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.setPassage(passage)
    return true
  }
}

/**
 * 改变角色队伍
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.teamId
 * @returns {Function}
 */
Command.changeActorTeam = function ({actor, teamId}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.setTeam(teamId)
    return true
  }
}

/**
 * 改变角色状态
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {string} [$.stateId]
 * @param {StateGetter} [$.state]
 * @returns {Function|null}
 */
Command.changeActorState = function ({actor, operation, stateId, state}) {
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'add': {
      const data = Data.states[stateId]
      return !data ? null : () => {
        const actor = getActor()
        if (actor) {
          const state = new State(data)
          if (Event.casterActor) {
            state.caster = Event.casterActor
          }
          state.currentTime = 60000
          state.duration = 60000
          actor.stateManager.add(state)
        }
        return true
      }
    }
    case 'remove':
      return () => {
        getActor()?.stateManager.delete(stateId)
        return true
      }
    case 'remove-instance': {
      const getState = Command.compileState(state)
      return () => {
        const state = getState()
        if (state) {
          getActor()?.stateManager.remove(state)
        }
        return true
      }
    }
  }
}

/**
 * 改变角色装备
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {string|VariableGetter} $.key
 * @param {EquipmentGetter} [$.equipment]
 * @returns {Function}
 */
Command.changeActorEquipment = function ({actor, operation, slot, equipmentId, equipment}) {
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'add': {
      const equipmentData = Data.equipments[equipmentId]
      const getSlot = Command.compileEnumValue(slot)
      return !equipmentData ? null : () => {
        getActor()?.equipmentManager.set(getSlot(), new Equipment(equipmentData))
        return true
      }
    }
    case 'remove':
      return () => {
        const actor = getActor()
        if (actor) {
          const equipment = actor.equipmentManager.getById(equipmentId)
          if (equipment) actor.equipmentManager.remove(equipment)
        }
        return true
      }
    case 'add-instance': {
      const getEquipment = Command.compileEquipment(equipment)
      const getSlot = Command.compileEnumValue(slot)
      return () => {
        const equipment = getEquipment()
        if (equipment) {
          getActor()?.equipmentManager.set(getSlot(), equipment)
        }
        return true
      }
    }
    case 'remove-instance': {
      const getEquipment = Command.compileEquipment(equipment)
      return () => {
        const equipment = getEquipment()
        if (equipment) {
          getActor()?.equipmentManager.remove(equipment)
        }
        return true
      }
    }
    case 'remove-slot': {
      const getSlot = Command.compileEnumValue(slot)
      return () => {
        getActor()?.equipmentManager.delete(getSlot())
        return true
      }
    }
  }
}

/**
 * 改变角色技能
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {string|VariableGetter} [$.skillId]
 * @param {SkillGetter} [$.skill]
 * @returns {Function}
 */
Command.changeActorSkill = function ({actor, operation, skillId, skill}) {
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'add': {
      const getSkillId = Command.compileString(skillId)
      return () => {
        const manager = getActor()?.skillManager
        const skillId = getSkillId()
        const data = Data.skills[skillId]
        if (manager && data && !manager.get(skillId)) {
          manager.add(new Skill(data))
        }
        return true
      }
    }
    case 'remove': {
      const getSkillId = Command.compileString(skillId)
      return () => {
        getActor()?.skillManager.delete(getSkillId())
        return true
      }
    }
    case 'remove-instance': {
      const getSkill = Command.compileSkill(skill)
      return () => {
        const skill = getSkill()
        if (skill) {
          getActor()?.skillManager.remove(skill)
        }
        return true
      }
    }
    case 'sort-by-order':
      return () => {
        getActor()?.skillManager.sort()
        return true
      }
  }
}

/**
 * 改变角色头像
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.mode
 * @param {string} [$.portrait]
 * @param {Array<Number>} [$.clip]
 * @returns {Function}
 */
 Command.changeActorPortrait = function ({actor, mode, portrait, clip}) {
  const getActor = Command.compileActor(actor)
  return () => {
    const actor = getActor()
    if (actor) {
      switch (mode) {
        case 'full':
          actor.portrait = portrait
          actor.clip.set(clip)
          break
        case 'portrait':
          actor.portrait = portrait
          break
        case 'clip':
          actor.clip.set(clip)
          break
      }
    }
    return true
  }
}

/**
 * 改变角色动画
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.animationId
 * @returns {Function}
 */
 Command.changeActorAnimation = function ({actor, animationId}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.setAnimation(animationId)
    return true
  }
}

/**
 * 改变角色精灵图(动画ID参数只是在编辑器中用来辅助获取精灵ID)
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.animationId
 * @param {string} $.spriteId
 * @param {string} $.image
 * @returns {Function}
 */
Command.changeActorSprite = function ({actor, animationId, spriteId, image}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.setSprite(spriteId, image)
    return true
  }
}

/**
 * 改变角色动作
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.type
 * @param {string} $.motion
 * @returns {Function}
 */
Command.changeActorMotion = function changeActorMotion({actor, type, motion}) {
  const getActor = Command.compileActor(actor)
  const motionName = Enum.getValue(motion)
  return !motionName ? null : () => {
    getActor()?.animationController.changeMotion(type, motionName)
    return true
  }
}

/**
 * 播放角色动画
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.motion
 * @param {number|VariableGetter} $.speed
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.playActorAnimation = function ({actor, motion, speed, wait}) {
  const getActor = Command.compileActor(actor)
  const getSpeed = Command.compileNumber(speed, 1, 0.1, 10)
  const motionName = Enum.getValue(motion)
  return () => {
    const actor = getActor()
    if (actor) {
      const animation = actor.animationController.playMotion(motionName, getSpeed())
      if (wait && animation) {
        const event = Event
        animation.onFinish(() => {
          event.continue()
        })
        return Event.pause()
      }
    }
    return true
  }
}

/**
 * 停止角色动画
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @returns {Function}
 */
Command.stopActorAnimation = function ({actor}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.animationController.stopMotion()
    return true
  }
}

/**
 * 添加动画组件
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.animationId
 * @param {string} $.motion
 * @param {boolean} $.rotatable
 * @param {boolean} $.syncAngle
 * @param {number} $.priority
 * @returns {Function}
 */
Command.addAnimationComponent = function ({actor, animationId, motion, rotatable, syncAngle, priority, offsetY}) {
  syncAngle = syncAngle ?? false // 补丁
  offsetY = offsetY ?? 0 // 补丁
  const animData = Data.animations[animationId]
  if (!animData) return null
  const key = animationId + motion
  const getActor = Command.compileActor(actor)
  const motionName = Enum.getValue(motion)
  return () => {
    const actor = getActor()
    if (actor) {
      const animation = new Animation(animData)
      if (animation.setMotion(motionName)) {
        animation.playing = false
        animation.defaultMotion = motionName
        animation.rotatable = rotatable
        animation.syncAngle = syncAngle
        animation.priority = priority
        animation.offsetY = offsetY
        actor.animationManager.set(key, animation)
      }
    }
    return true
  }
}

/**
 * 设置动画组件
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.animationId
 * @param {string} $.motion
 * @param {string} $.operation
 * @param {number} [$.angle]
 * @param {number} [$.scale]
 * @param {number} [$.speed]
 * @param {number} [$.opacity]
 * @param {number} [$.priority]
 * @param {string} [$.playMotion]
 * @param {boolean} [$.wait]
 * @returns {Function}
 */
 Command.setAnimationComponent = function ({actor, animationId, motion, operation, angle, scale, speed, opacity, priority, offsetY, spriteId, image, playMotion, wait}) {
  const key = animationId + motion
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'set-angle': {
      const getAngle = Command.compileAngle(angle)
      return () => {
        const actor = getActor()
        const animation = actor?.animationManager.get(key)
        if (animation) animation.setAngle(getAngle(actor))
        return true
      }
    }
    case 'set-scale': {
      const getScale = Command.compileNumber(scale)
      return () => {
        const scale = Math.clamp(getScale(), 0, 10)
        getActor()?.animationManager.setScale(key, scale)
        return true
      }
    }
    case 'set-speed': {
      const getSpeed = Command.compileNumber(speed)
      return () => {
        const animation = getActor()?.animationManager.get(key)
        if (animation) animation.speed = Math.clamp(getSpeed(), 0, 10)
        return true
      }
    }
    case 'set-opacity': {
      const getOpacity = Command.compileNumber(opacity)
      return () => {
        const animation = getActor()?.animationManager.get(key)
        if (animation) animation.opacity = Math.clamp(getOpacity(), 0, 1)
        return true
      }
    }
    case 'set-priority':
      return () => {
        getActor()?.animationManager.setPriority(key, priority)
        return true
      }
    case 'set-offsetY':
      return () => {
        getActor()?.animationManager.setOffsetY(key, offsetY)
        return true
      }
    case 'set-sprite':
      return () => {
        getActor()?.animationManager.setSprite(key, spriteId, image)
        return true
      }
    case 'play-motion': {
      const motionName = Enum.getValue(playMotion)
      return () => {
        const actor = getActor()
        if (actor) {
          const animation = actor.animationManager.playMotion(key, motionName)
          if (wait && animation) {
            const event = Event
            animation.onFinish(() => {
              event.continue()
            })
            return Event.pause()
          }
        }
        return true
      }
    }
    case 'stop-motion':
      return () => {
        getActor()?.animationManager.stopMotion(key)
        return true
      }
  }
}

/**
 * 移除动画组件
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.animationId
 * @param {string} $.motion
 * @returns {Function}
 */
 Command.removeAnimationComponent = function ({actor, animationId, motion}) {
  const key = animationId + motion
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.animationManager.delete(key)
    return true
  }
}

/**
 * 创建全局角色
 * @param {Object} $
 * @param {string} $.actorId
 * @param {string} $.teamId
 * @returns {Function}
 */
Command.createGlobalActor = function ({actorId, teamId}) {
  return () => {
    ActorManager.create(actorId)?.setTeam(teamId)
    return true
  }
}

/**
 * 转移全局角色
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {PositionGetter} $.position
 * @returns {Function}
 */
Command.transferGlobalActor = function ({actor, position}) {
  const getActor = Command.compileActor(actor)
  const getPoint = Command.compilePosition(position)
  return () => {
    const actor = getActor()
    const point = getPoint()
    if (actor instanceof GlobalActor && point) {
      actor.transferToScene(point.x, point.y)
    }
    return true
  }
}

/**
 * 删除全局角色
 * @param {Object} $
 * @param {string} $.actorId
 * @returns {Function}
 */
Command.deleteGlobalActor = function ({actorId}) {
  return () => {
    ActorManager.delete(actorId)
    return true
  }
}

/**
 * 获取目标
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.selector
 * @param {string} $.condition
 * @param {string} [$.attribute]
 * @param {string} [$.divisor]
 * @returns {Function}
 */
Command.getTarget = function ({actor, selector, condition, attribute, divisor}) {
  const getActor = Command.compileActor(actor)
  const inspector = Actor.inspectors[selector]
  switch (condition) {
    case 'max-threat':
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetMaxThreat(inspector)
        return true
      }
    case 'nearest':
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetNearest(inspector)
        return true
      }
    case 'farthest':
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetFarthest(inspector)
        return true
      }
    case 'min-attribute-value': {
      const attributeKey = Attribute.getKey(attribute)
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetMinAttributeValue(inspector, attributeKey)
        return true
      }
    }
    case 'max-attribute-value': {
      const attributeKey = Attribute.getKey(attribute)
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetMaxAttributeValue(inspector, attributeKey)
        return true
      }
    }
    case 'min-attribute-ratio': {
      const attributeKey = Attribute.getKey(attribute)
      const divisorKey = Attribute.getKey(divisor)
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetMinAttributeRatio(inspector, attributeKey, divisorKey)
        return true
      }
    }
    case 'max-attribute-ratio': {
      const attributeKey = Attribute.getKey(attribute)
      const divisorKey = Attribute.getKey(divisor)
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetMaxAttributeRatio(inspector, attributeKey, divisorKey)
        return true
      }
    }
    case 'random':
      return () => {
        Event.targetActor = getActor()?.targetManager.getTargetRandom(inspector)
        return true
      }
  }
}

/**
 * 添加目标
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {ActorGetter} $.target
 * @returns {Function}
 */
 Command.appendTarget = function ({actor, target}) {
  const getActor = Command.compileActor(actor)
  const getTarget = Command.compileActor(target)
  return () => {
    const target = getTarget()
    if (target && Scene.actors === target.parent && target.active) {
      getActor()?.targetManager.append(target)
    }
    return true
  }
}

/**
 * 移除目标
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {ActorGetter} $.target
 * @returns {Function}
 */
Command.removeTarget = function ({actor, target}) {
  const getActor = Command.compileActor(actor)
  const getTarget = Command.compileActor(target)
  return () => {
    const target = getTarget()
    if (target && Scene.actors === target.parent && target.active) {
      getActor()?.targetManager.remove(target)
    }
    return true
  }
}

/**
 * 探测目标
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {number|VariableGetter} $.distance
 * @param {string} $.selector
 * @param {boolean} $.inSight
 * @returns {Function}
 */
Command.detectTargets = function ({actor, distance, selector, inSight}) {
  const getActor = Command.compileActor(actor)
  const getDistance = Command.compileNumber(distance)
  const inspector = Actor.inspectors[selector]
  return () => {
    getActor()?.targetManager.detect(getDistance(), inspector, inSight)
    return true
  }
}

/**
 * 放弃目标
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.selector
 * @param {number} $.distance
 * @returns {Function}
 */
Command.discardTargets = function ({actor, selector, distance}) {
  const getActor = Command.compileActor(actor)
  const inspector = Actor.inspectors[selector]
  return () => {
    getActor()?.targetManager.discard(inspector, distance)
    return true
  }
}

/**
 * 重置目标列表
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @returns {Function}
 */
Command.resetTargets = function ({actor}) {
  const getActor = Command.compileActor(actor)
  return () => {
    getActor()?.targetManager.resetTargets()
    return true
  }
}

/**
 * 施放技能
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.mode
 * @param {string} [$.key]
 * @param {string} [$.skillId]
 * @param {SkillGetter} [$.skill]
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.castSkill = function ({actor, mode, key, skillId, skill, wait}) {
  const getActor = Command.compileActor(actor)
  let getSkill
  switch (mode) {
    case 'by-key': {
      const shortcutKey = Enum.getValue(key)
      getSkill = () => getActor()?.shortcutManager.getSkill(shortcutKey)
      break
    }
    case 'by-id':
      getSkill = () => getActor()?.skillManager.get(skillId)
      break
    case 'by-skill': {
      const getInstance = Command.compileSkill(skill)
      getSkill = () => {
        const actor = getActor()
        const skill = getInstance()
        if (actor && skill && actor.skillManager === skill.parent) {
          return skill
        }
      }
      break
    }
  }
  switch (wait) {
    case false:
      return () => {
        getSkill()?.cast()
        return true
      }
    case true:
      return () => {
        const casting = getSkill()?.cast()
        if (casting && !casting.complete) {
          const event = Event
          casting.onFinish(() => {
            event.continue()
          })
          return Event.pause()
        }
        return true
      }
  }
}

/**
 * 设置技能
 * @param {Object} $
 * @param {SkillGetter} $.skill
 * @param {string} $.operation
 * @param {number|VariableGetter} [$.cooldown]
 * @returns {Function}
 */
Command.setSkill = function ({skill, operation, cooldown}) {
  const getSkill = Command.compileSkill(skill)
  switch(operation) {
    case 'set-cooldown': {
      const getCD = Command.compileNumber(cooldown)
      return () => {
        getSkill()?.setCooldown(getCD())
        return true
      }
    }
    case 'increase-cooldown': {
      const getCD = Command.compileNumber(cooldown)
      return () => {
        getSkill()?.increaseCooldown(getCD())
        return true
      }
    }
    case 'decrease-cooldown': {
      const getCD = Command.compileNumber(cooldown)
      return () => {
        getSkill()?.decreaseCooldown(getCD())
        return true
      }
    }
  }
}

/**
 * 创建触发器
 * @param {Object} $
 * @param {string} $.triggerId
 * @param {ActorGetter} $.caster
 * @param {PositionGetter} $.origin
 * @param {AngleGetter} $.angle
 * @param {number|VariableGetter} $.distance
 * @param {number|VariableGetter} $.scale
 * @param {number|VariableGetter} $.timeScale
 * @returns {Function|null}
 */
Command.createTrigger = function ({triggerId, caster, origin, angle, distance, scale, timeScale}) {
  const getTriggerId = Command.compileString(triggerId)
  const getCaster = Command.compileActor(caster)
  const getOrigin = Command.compilePosition(origin)
  const getAngle = Command.compileAngle(angle)
  const getDistance = Command.compileNumber(distance)
  const getScale = Command.compileNumber(scale, 1, 0.1, 10)
  const getTimeScale = Command.compileNumber(timeScale, 1, 0.1, 10)
  return () => {
    const data = Data.triggers[getTriggerId()]
    const caster = getCaster()
    const origin = getOrigin()
    if (data && caster && origin) {
      const angle = getAngle(origin)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const trigger = new Trigger(data)
      const distance = getDistance()
      const x = origin.x + distance * cos
      const y = origin.y + distance * sin
      trigger.angle = angle
      trigger.caster = caster
      trigger.skill = Event.triggerSkill
      trigger.timeScale = getTimeScale()
      trigger.setScale(getScale())
      trigger.setPosition(x, y)
      trigger.updateVelocity()
      // 如果在低优先级事件中创建触发器
      // 有必要立即更新动作方向
      trigger.updateAnimation(0)
      Scene.triggers.append(trigger)
    }
    return true
  }
}

/**
 * 设置触发器速度
 * @param {Object} $
 * @param {TriggerGetter} $.trigger
 * @param {number|VariableGetter} $.speed
 * @returns {Function}
 */
Command.setTriggerSpeed = function ({trigger, speed}) {
  const getTrigger = Command.compileTrigger(trigger)
  const getSpeed = Command.compileNumber(speed)
  return () => {
    getTrigger()?.setSpeed(getSpeed())
    return true
  }
}

/**
 * 设置触发器角度
 * @param {Object} $
 * @param {TriggerGetter} $.trigger
 * @param {number|VariableGetter} $.angle
 * @returns {Function}
 */
Command.setTriggerAngle = function ({trigger, angle}) {
  const getTrigger = Command.compileTrigger(trigger)
  const getAngle = Command.compileAngle(angle)
  return () => {
    const trigger = getTrigger()
    if (trigger) {
      trigger.setAngle(getAngle(trigger))
    }
    return true
  }
}

/**
 * 设置触发器持续时间
 * @param {Object} $
 * @param {TriggerGetter} $.trigger
 * @param {string} $.operation
 * @param {number|VariableGetter} $.duration
 * @returns {Function}
 */
Command.setTriggerDuration = function ({trigger, operation, duration}) {
  const getTrigger = Command.compileTrigger(trigger)
  const getDuration = Command.compileNumber(duration)
  return () => {
    const trigger = getTrigger()
    if (trigger) {
      switch (operation) {
        case 'set':
          trigger.duration = getDuration()
          break
        case 'increase':
          trigger.duration += getDuration()
          break
        case 'decrease':
          trigger.duration -= getDuration()
          break
      }
    }
    return true
  }
}

/**
 * 设置触发器动作
 * @param {Object} $
 * @param {TriggerGetter} $.trigger
 * @param {string} $.motion
 * @returns {Function}
 */
Command.setTriggerMotion = function ({trigger, motion}) {
  const getTrigger = Command.compileTrigger(trigger)
  const motionName = Enum.getValue(motion)
  return !motionName ? null : () => {
    getTrigger()?.animation?.setMotion(motionName)
    return true
  }
}

/**
 * 设置库存
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {number|VariableGetter} [$.money]
 * @param {string|VariableGetter} [$.itemId]
 * @param {number|VariableGetter} [$.quantity]
 * @param {string|VariableGetter} [$.equipmentId]
 * @param {EquipmentGetter} [$.equipment]
 * @param {ActorGetter} [$.refActor]
 * @returns {Function}
 */
Command.setInventory = function ({actor, operation, money, itemId, quantity, equipmentId, equipment, order1, order2, refActor}) {
  const getActor = Command.compileActor(actor)
  switch (operation) {
    case 'increase-money': {
      const getMoney = Command.compileNumber(money)
      return () => {
        getActor()?.inventory.increaseMoney(getMoney())
        return true
      }
    }
    case 'decrease-money': {
      const getMoney = Command.compileNumber(money)
      return () => {
        getActor()?.inventory.decreaseMoney(getMoney())
        return true
      }
    }
    case 'increase-items': {
      const getId = Command.compileString(itemId)
      const getQuantity = Command.compileNumber(quantity)
      return () => {
        getActor()?.inventory.increaseItems(getId(), getQuantity())
        return true
      }
    }
    case 'decrease-items': {
      const getId = Command.compileString(itemId)
      const getQuantity = Command.compileNumber(quantity)
      return () => {
        getActor()?.inventory.decreaseItems(getId(), getQuantity())
        return true
      }
    }
    case 'gain-equipment': {
      const getId = Command.compileString(equipmentId)
      return () => {
        getActor()?.inventory.createEquipment(getId())
        return true
      }
    }
    case 'lose-equipment': {
      const getId = Command.compileString(equipmentId)
      return () => {
        getActor()?.inventory.deleteEquipment(getId())
        return true
      }
    }
    case 'gain-equipment-instance': {
      const getEquipment = Command.compileEquipment(equipment)
      return () => {
        const equipment = getEquipment()
        if (equipment) {
          getActor()?.inventory.gainEquipment(equipment)
        }
        return true
      }
    }
    case 'lose-equipment-instance': {
      const getEquipment = Command.compileEquipment(equipment)
      return () => {
        const equipment = getEquipment()
        if (equipment) {
          getActor()?.inventory.loseEquipment(equipment)
        }
        return true
      }
    }
    case 'swap': {
      const getOrder1 = Command.compileNumber(order1)
      const getOrder2 = Command.compileNumber(order2)
      return () => {
        getActor()?.inventory.swap(getOrder1(), getOrder2())
        return true
      }
    }
    case 'sort':
      return () => {
        getActor()?.inventory.sort(false)
        return true
      }
    case 'sort-by-order':
      return () => {
        getActor()?.inventory.sort(true)
        return true
      }
    case 'reference': {
      const getRefActor = Command.compileActor(refActor)
      return () => {
        const sActor = getActor()
        const dActor = getRefActor()
        if (sActor && dActor instanceof GlobalActor) {
          sActor.useInventory(dActor.inventory)
        }
        return true
      }
    }
    case 'dereference':
      return () => {
        getActor()?.restoreInventory()
        return true
      }
    case 'reset':
      return () => {
        getActor()?.inventory.reset()
        return true
      }
  }
}

/**
 * 使用物品
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.mode
 * @param {string} [$.key]
 * @param {string} [$.itemId]
 * @param {ItemGetter} [$.item]
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.useItem = function ({actor, mode, key, itemId, item, wait}) {
  const getActor = Command.compileActor(actor)
  let getItem
  switch (mode) {
    case 'by-key': {
      const shortcutKey = Enum.getValue(key)
      getItem = () => getActor()?.shortcutManager.getItem(shortcutKey)
      break
    }
    case 'by-id':
      getItem = () => getActor()?.inventory.get(itemId)
      break
    case 'by-item': {
      const getInstance = Command.compileItem(item)
      getItem = () => {
        const actor = getActor()
        const item = getInstance()
        if (actor && item && actor.inventory === item.parent) {
          return item
        }
      }
      break
    }
  }
  switch (wait) {
    case false:
      return () => {
        getItem()?.use(getActor())
        return true
      }
    case true:
      return () => {
        const using = getItem()?.use(getActor())
        if (using && !using.complete) {
          const event = Event
          using.onFinish(() => {
            event.continue()
          })
          return Event.pause()
        }
        return true
      }
  }
}

/**
 * 设置物品
 * @param {Object} $
 * @param {ItemGetter} $.item
 * @param {string} $.operation
 * @param {number|VariableGetter} [$.quantity]
 * @returns {Function}
 */
Command.setItem = function ({item, operation, quantity}) {
  const getItem = Command.compileItem(item)
  switch(operation) {
    case 'increase': {
      const getQuantity = Command.compileNumber(quantity)
      return () => (getItem()?.increase(getQuantity()), true)
    }
    case 'decrease': {
      const getQuantity = Command.compileNumber(quantity)
      return () => (getItem()?.decrease(getQuantity()), true)
    }
  }
}

/**
 * 设置冷却时间
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {string|VariableGetter} $.key
 * @param {number|VariableGetter} $.cooldown
 * @returns {Function|null}
 */
Command.setCooldown = function ({actor, operation, key, cooldown}) {
  const getActor = Command.compileActor(actor)
  const getKey = Command.compileEnumValue(key)
  const getCooldown = Command.compileNumber(cooldown)
  const methodName = {
    set: 'setCooldown',
    increase: 'increaseCooldown',
    decrease: 'decreaseCooldown',
  }[operation]
  return () => {
    getActor()?.cooldownManager[methodName](getKey(), getCooldown())
    return true
  }
}

/**
 * 设置快捷键
 * @param {Object} $
 * @param {ActorGetter} $.actor
 * @param {string} $.operation
 * @param {string} [$.itemId]
 * @param {string} [$.skillId]
 * @param {string} $.key
 * @returns {Function|null}
 */
Command.setShortcut = function ({actor, operation, key, key2, itemId, skillId}) {
  const getActor = Command.compileActor(actor)
  const getShortcutKey = Command.compileEnumValue(key)
  switch(operation) {
    case 'set-item-shortcut': {
      const getItemId = Command.compileString(itemId)
      return () => {
        getActor()?.shortcutManager.setId(getShortcutKey(), getItemId())
        return true
      }
    }
    case 'set-skill-shortcut': {
      const getSkillId = Command.compileString(skillId)
      return () => {
        getActor()?.shortcutManager.setId(getShortcutKey(), getSkillId())
        return true
      }
    }
    case 'delete-shortcut':
      return () => {
        getActor()?.shortcutManager.delete(getShortcutKey())
        return true
      }
    case 'swap-shortcuts': {
      const getShortcutKey2 = Command.compileEnumValue(key2)
      return () => {
        getActor()?.shortcutManager.swap(getShortcutKey(), getShortcutKey2())
        return true
      }
    }
  }
}

/**
 * 激活场景
 * @param {Object} $
 * @param {number} $.pointer
 * @returns {Function}
 */
Command.activateScene = function ({pointer}) {
  return () => {
    if (Scene.pointer === pointer) {
      return true
    }
    Scene.activate(pointer)
    return Event.wait(0)
  }
}

/**
 * 加载场景
 * @param {Object} $
 * @param {string} $.sceneId
 * @param {boolean} $.transfer
 * @param {number} [$.x]
 * @param {number} [$.y]
 * @returns {Function}
 */
Command.loadScene = function ({sceneId, transfer, x, y}) {
  const getSceneId = Command.compileString(sceneId)
  switch (transfer) {
    case true: {
      const getX = Command.compileNumber(x)
      const getY = Command.compileNumber(y)
      return () => {
        const event = Event
        const x = Math.floor(getX()) + 0.5
        const y = Math.floor(getY()) + 0.5
        Scene.load(getSceneId()).then(() => {
          Party.player?.transferToScene(x, y)
          event.continue()
        })
        return Event.pause()
      }
    }
    case false:
      return () => {
        const event = Event
        Scene.load(getSceneId()).then(() => {
          event.continue()
        })
        return Event.pause()
      }
  }
}

/**
 * 加载子场景
 * @param {Object} $
 * @param {string} $.sceneId
 * @param {number} $.shiftX
 * @param {number} $.shiftY
 * @returns {Function}
 */
Command.loadSubscene = function ({sceneId, shiftX, shiftY}) {
  const getSceneId = Command.compileString(sceneId)
  const getShiftX = Command.compileNumber(shiftX)
  const getShiftY = Command.compileNumber(shiftY)
  return () => {
    Scene.binding?.loadSubscene(
      getSceneId(),
      Math.floor(getShiftX()),
      Math.floor(getShiftY()),
    )
    return true
  }
}

/**
 * 卸载子场景
 * @param {Object} $
 * @param {string} $.sceneId
 * @returns {Function}
 */
Command.unloadSubscene = function ({sceneId}) {
  const getSceneId = Command.compileString(sceneId)
  return () => {
    Scene.binding?.unloadSubscene(getSceneId())
    return true
  }
}

/**
 * 删除场景
 * @returns {Function}
 */
Command.deleteScene = function () {
  return () => {
    Scene.delete()
    return true
  }
}

/**
 * 移动摄像机
 * @param {Object} $
 * @param {string} $.mode
 * @param {PositionGetter} [$.position]
 * @param {ActorGetter} [$.actor]
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.moveCamera = function ({mode, position, actor, easingId, duration, wait}) {
  switch (mode) {
    case 'position': {
      const getPoint = Command.compilePosition(position)
      return () => {
        if (Scene.binding !== null) {
          const point = getPoint(Camera)
          if (point) {
            Camera.moveTo(point.x, point.y, easingId, duration)
            if (wait && duration > 0) {
              return Event.wait(duration)
            }
          }
        }
        return true
      }
    }
    case 'actor': {
      const getActor = Command.compileActor(actor)
      return () => {
        if (Scene.binding !== null) {
          const actor = getActor()
          if (actor && !actor.destroyed) {
            Camera.follow(actor, easingId, duration)
            if (wait && duration > 0) {
              return Event.wait(duration)
            }
          }
        }
        return true
      }
    }
  }
}

/**
 * 设置缩放率
 * @param {Object} $
 * @param {number|VariableGetter} $.zoom
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setZoomFactor = function ({zoom, easingId, duration, wait}) {
  const getZoom = Command.compileNumber(zoom, 1, 1, 8)
  const getDuration = Command.compileNumber(duration)
  return () => {
    if (Scene.binding !== null) {
      const zoom = getZoom()
      const duration = getDuration()
      Camera.setZoomFactor(zoom, easingId, duration)
      if (wait && duration > 0) {
        return Event.wait(duration)
      }
    }
    return true
  }
}

/**
 * 设置环境光
 * @param {Object} $
 * @param {number|VariableGetter} $.red
 * @param {number|VariableGetter} $.green
 * @param {number|VariableGetter} $.blue
 * @param {string} $.easingId
 * @param {number|VariableGetter} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setAmbientLight = function ({red, green, blue, easingId, duration, wait}) {
  const getRed = Command.compileNumber(red, 0, 0, 255)
  const getGreen = Command.compileNumber(green, 0, 0, 255)
  const getBlue = Command.compileNumber(blue, 0, 0, 255)
  const getDuration = Command.compileNumber(duration)
  return () => {
    if (Scene.binding !== null) {
      const red = getRed()
      const green = getGreen()
      const blue = getBlue()
      const duration = getDuration()
      Scene.binding.setAmbientLight(red, green, blue, easingId, duration)
      if (wait && duration > 0) {
        return Event.wait(duration)
      }
    }
    return true
  }
}

/**
 * 改变画面色调
 * @param {Object} $
 * @param {Array<number>} $.tint
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.tintScreen = function ({tint, easingId, duration, wait}) {
  return () => {
    Tinter.set(tint, easingId, duration)
    if (wait && duration > 0) {
      return Event.wait(duration)
    }
    return true
  }
}

/**
 * 震动屏幕
 * @param {Object} $
 * @param {string} $.mode
 * @param {number} $.power
 * @param {number} $.speed
 * @param {string} $.easingId
 * @param {number} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.shakeScreen = function ({mode, power, speed, easingId, duration, wait}) {
  return () => {
    Camera.shake(mode, power, speed, easingId, duration)
    if (wait && duration > 0) {
      return Event.wait(duration)
    }
    return true
  }
}

/**
 * 设置图块
 * @param {Object} $
 * @param {TilemapGetter} $.tilemap
 * @param {number} $.tilemapX
 * @param {number} $.tilemapY
 * @param {string} $.tilesetId
 * @param {number} $.tilesetX
 * @param {number} $.tilesetY
 * @returns {Function}
 */
Command.setTile = function ({tilemap, tilemapX, tilemapY, tilesetId, tilesetX, tilesetY}) {
  const getTilemap = Command.compileTilemap(tilemap)
  const getTilemapX = Command.compileNumber(tilemapX)
  const getTilemapY = Command.compileNumber(tilemapY)
  const getTilesetX = Command.compileNumber(tilesetX)
  const getTilesetY = Command.compileNumber(tilesetY)
  return () => {
    const tilemap = getTilemap()
    if (tilemap) {
      tilemap.setTile(
        Math.floor(getTilemapX()),
        Math.floor(getTilemapY()),
        tilesetId,
        Math.floor(getTilesetX()),
        Math.floor(getTilesetY()),
      )
    }
    return true
  }
}

/**
 * 删除图块
 * @param {Object} $
 * @param {TilemapGetter} $.tilemap
 * @param {number} $.tilemapX
 * @param {number} $.tilemapY
 * @returns {Function}
 */
Command.deleteTile = function ({tilemap, tilemapX, tilemapY}) {
  const getTilemap = Command.compileTilemap(tilemap)
  const getTilemapX = Command.compileNumber(tilemapX)
  const getTilemapY = Command.compileNumber(tilemapY)
  return () => {
    getTilemap()?.deleteTile(
      Math.floor(getTilemapX()),
      Math.floor(getTilemapY()),
    )
    return true
  }
}

/**
 * 设置地形
 * @param {Object} $
 * @param {PositionGetter} $.position
 * @param {string} $.terrain
 * @returns {Function}
 */
Command.setTerrain = function ({position, terrain}) {
  const getPoint = Command.compilePosition(position)
  let code
  switch (terrain) {
    case 'land': code = 0; break
    case 'water': code = 1; break
    case 'wall': code = 2; break
  }
  return () => {
    const scene = Scene.binding
    const point = getPoint()
    if (scene !== null && point) {
      const x = Math.floor(point.x)
      const y = Math.floor(point.y)
      scene.terrains.set(x, y, code)
    }
    return true
  }
}

/**
 * 设置游戏速度
 * @param {Object} $
 * @param {number|VariableGetter} $.speed
 * @param {string} $.easingId
 * @param {number|VariableGetter} $.duration
 * @param {boolean} $.wait
 * @returns {Function}
 */
Command.setGameSpeed = function ({speed, easingId, duration, wait}) {
  const getSpeed = Command.compileNumber(speed, 0, 0, 10)
  const getDuration = Command.compileNumber(duration)
  return () => {
    const speed = getSpeed()
    const duration = getDuration()
    Time.setTimeScale(speed, easingId, duration)
    if (wait && duration > 0) {
      const event = Event
      Time.onTransitionEnd(() => {
        event.continue()
      })
      return Event.pause()
    }
    return true
  }
}

/**
 * 设置鼠标指针
 * @param {Object} $
 * @param {string} $.image
 * @returns {Function}
 */
Command.setCursor = function ({image}) {
  const style = document.documentElement.style
  const meta = Data.manifest.guidMap[image]
  const path = meta?.path ?? ''
  let cursor = 'default'
  let promise = null
  if (path) {
    if (/\.dat$/.test(path)) {
      promise = File.xhr({path, type: 'arraybuffer'}).then(buffer => {
        const blob = new Blob([decrypt(buffer)])
        const url = URL.createObjectURL(blob)
        cursor = `${CSS.encodeURL(url)}, default`
        promise = null
      })
    } else {
      cursor = `${CSS.encodeURL(path)}, default`
    }
  }
  return () => {
    if (style.path !== path) {
      style.path = path
      style.cursor = cursor
      promise?.then(() => {
        if (style.path === path) {
          style.cursor = cursor
        }
      })
    }
    return true
  }
}

/**
 * 设置队伍关系
 * @param {Object} $
 * @param {string} $.teamId1
 * @param {string} $.teamId2
 * @param {number} $.relation
 * @returns {Function}
 */
Command.setTeamRelation = function ({teamId1, teamId2, relation}) {
  return () => {
    Team.changeRelation(teamId1, teamId2, relation)
    return true
  }
}

/**
 * 开关碰撞系统
 * @param {Object} $
 * @param {string} $.operation
 * @returns {Function}
 */
Command.switchCollisionSystem = function ({operation}) {
  switch (operation) {
    case 'enable-actor-collision':
      return () => {
        ActorCollider.actorCollisionEnabled = true
        return true
      }
    case 'disable-actor-collision':
      return () => {
        ActorCollider.actorCollisionEnabled = false
        return true
      }
    case 'enable-scene-collision':
      return () => {
        ActorCollider.sceneCollisionEnabled = true
        return true
      }
    case 'disable-scene-collision':
      return () => {
        ActorCollider.sceneCollisionEnabled = false
        return true
      }
  }
}

/**
 * 游戏数据
 * @param {Object} $
 * @param {string} $.operation
 * @param {number} $.index
 * @param {string} $.variables
 * @returns {Function}
 */
Command.gameData = function ({operation, index, variables}) {
  switch (operation) {
    case 'save': {
      const getIndex = Command.compileNumber(index, -1, -1, 32)
      const keys = variables.split(/\s*,\s*/)
      return () => {
        const index = getIndex()
        if (index === -1) {
          return true
        }
        const meta = {}
        const event = Event
        const {attributes} = event
        for (const key of keys) {
          const value = attributes[key]
          switch (typeof value) {
            case 'boolean':
            case 'number':
            case 'string':
              meta[key] = value
              continue
          }
        }
        Data.saveGameData(index, meta).then(() => {
          event.continue()
        })
        return Event.pause()
      }
    }
    case 'load': {
      const getIndex = Command.compileNumber(index, -1, -1, 32)
      return () => {
        const index = getIndex()
        if (index === -1) {
          return true
        }
        const event = Event
        Data.loadGameData(index).then(() => {
          event.continue()
        })
        return Event.pause()
      }
    }
    case 'delete': {
      const getIndex = Command.compileNumber(index, -1, -1, 32)
      return () => {
        const index = getIndex()
        if (index === -1) {
          return true
        }
        const event = Event
        Data.deleteGameData(index).then(() => {
          event.continue()
        })
        return Event.pause()
      }
    }
  }
}

/**
 * 重置游戏
 * @returns {Function}
 */
Command.reset = function () {
  return () => {
    Game.reset()
    return true
  }
}

/**
 * 暂停游戏
 * @returns {Function}
 */
Command.pauseGame = function () {
  return () => {
    Scene.pause()
    return true
  }
}

/**
 * 继续游戏
 * @returns {Function}
 */
Command.continueGame = function () {
  return () => {
    Scene.continue()
    return true
  }
}

/**
 * 阻止场景输入事件
 * @returns {Function}
 */
Command.preventSceneInput = function () {
  return () => {
    Scene.preventInput()
    return true
  }
}

/**
 * 恢复场景输入事件
 * @returns {Function}
 */
Command.restoreSceneInput = function () {
  return () => {
    Scene.restoreInput()
    return true
  }
}

/**
 * 模拟按键
 * @param {Object} $
 * @param {string} $.operation
 * @param {string} $.keycode
 * @returns {Function}
 */
Command.simulateKey = function ({operation, keycode}) {
  return () => {
    switch (operation) {
      case 'click':
        Input.simulateKey('keydown', keycode)
        Input.simulateKey('keyup', keycode)
        break
      case 'press':
        Input.simulateKey('keydown', keycode)
        break
      case 'release':
        Input.simulateKey('keyup', keycode)
        break
    }
    return true
  }
}

/**
 * 设置语言
 * @param {Object} $
 * @param {string} $.language
 * @returns {Function}
 */
Command.setLanguage = function ({language}) {
  return () => {
    Local.setLanguage(language)
    return true
  }
}

/**
 * 设置分辨率
 * @param {Object} $
 * @param {number|VariableGetter} $.width
 * @param {number|VariableGetter} $.height
 * @param {number|VariableGetter} $.sceneScale
 * @param {number|VariableGetter} $.uiScale
 * @returns {Function}
 */
Command.setResolution = function ({width, height, sceneScale, uiScale}) {
  const getWidth = Command.compileNumber(width, 1920, 240, 7680)
  const getHeight = Command.compileNumber(height, 1080, 240, 7680)
  const getSceneScale = Command.compileNumber(sceneScale, 1, 0.5, 4)
  const getUiScale = Command.compileNumber(uiScale, 1, 0.5, 4)
  return () => {
    Stage.setResolution(getWidth(), getHeight(), getSceneScale(), getUiScale())
    return true
  }
}

/**
 * 执行脚本
 * @param {Object} $
 * @param {string} $.script
 * @returns {Function|null}
 */
Command.script = function ({script}) {
  let {escape} = Command.script
  if (escape === undefined) {
    escape = /(?<=(?:[^\p{L}$_\d\s]|\n|^)\s*)\(\s*([\p{L}$_\d]+)\s*\)(?!\s*=>)/gu
    Command.script.escape = escape
  }
  try {
    const code = script.replace(escape, 'Event.attributes["$1"]')
    const fn = new Function(code)
    return () => (fn(), true)
  } catch (error) {
    return null
  }
}