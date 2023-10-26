'use strict'

// ******************************** 界面对象 ********************************

const UI = new class {
  /** 根元素
   *  @type {RootElement}
   */ root

  /** 指针事件根元素
   *  @type {Array<UIElement>}
   */ pointerEventRoots = []

  /** 焦点元素列表
   *  @type {Array<UIElement>}
   */ focuses = []

  /** 界面缩放系数
   *  @type {number}
   */ scale = 1

  /** 按下的方向键
   *  @type {string}
   */ dirKey = ''

  /** 激活按键连发模式
   *  @type {boolean}
   */ turbo = false

  /** 连发模式累计时间
   *  @type {number}
   */ turboElapsed = 0

  /** 最新创建的元素
   *  @type {UIElement|undefined}
   */ latest

  /** 目标元素
   *  @type {UIElement|null}
   */ target = null

  /** 鼠标悬浮中的元素
   *  @type {UIElement|null}
   */ hover = null

  /** 元素管理器
   *  @type {UIElementManager}
   */ manager

  /** ID->预设元素数据映射表
   *  @type {Object}
   */ presets = {}

  /** ID->元素映射表
   *  @type {Object}
   */ idMap = {}

  // 元素类映射表
  elementClassMap

  /** 初始化界面管理器 */
  initialize() {
    // 创建根元素
    this.root = new RootElement()
    this.root.resize()

    // 设置初始界面缩放系数
    this.setScale(Data.globalData.uiScale)

    // 引用元素管理器
    this.manager = UIElementManager

    // 加载预设元素
    this.loadPresets()

    // 元素类映射表(数据类名->类)
    this.elementClassMap = {
      image: ImageElement,
      text: TextElement,
      textbox: TextBoxElement,
      dialogbox: DialogBoxElement,
      progressbar: ProgressBarElement,
      button: ButtonElement,
      animation: AnimationElement,
      video: VideoElement,
      window: WindowElement,
      container: ContainerElement,
    }

    // 侦听事件
    window.on('resize', this.resize)
    Input.on('keydown', this.keydown)
    Input.on('keyup', this.keyup)
    Input.on('mousedown', this.mousedown)
    Input.on('mousedownLB', this.mousedownLB)
    Input.on('mousedownRB', this.mousedownRB)
    Input.on('mouseup', this.mouseup)
    Input.on('mouseupLB', this.mouseupLB)
    Input.on('mouseupRB', this.mouseupRB)
    Input.on('mousemove', this.mousemove)
    Input.on('mouseleave', this.mouseleave)
    Input.on('doubleclick', this.doubleclick)
    Input.on('wheel', this.wheel)
    Input.on('gamepadbuttonpress', this.gamepadbuttonpress)
    Input.on('gamepadbuttonrelease', this.gamepadbuttonrelease)
    Input.on('gamepadleftstickchange', this.gamepadleftstickchange)
    Input.on('gamepadrightstickchange', this.gamepadrightstickchange)
  }

  // 设置缩放系数
  setScale(value) {
    this.scale = value
    this.root.resize()
    Printer.updateScale()
  }

  /** 加载预设元素 */
  loadPresets() {
    const presets = this.presets
    const setMap = (nodes, ui) => {
      for (const node of nodes) {
        node.ui = ui
        presets[node.presetId] = node
        if (node.children.length !== 0) {
          setMap(node.children, ui)
        }
      }
    }
    for (const ui of Object.values(Data.ui)) {
      setMap(ui.nodes, ui)
    }
  }

  /**
   * 加载界面中的所有元素
   * @param {string} uiId 界面文件ID
   * @returns {UIElement[]}
   */
  loadUI(uiId) {
    const elements = []
    const ui = Data.ui[uiId]
    if (!ui) return elements
    Script.deferredLoading = true
    // 创建所有的元素
    for (const node of ui.nodes) {
      if (node.enabled) {
        elements.push(this._createElement(node))
      }
    }
    Script.loadDeferredParameters()
    return elements
  }

  /**
   * 创建预设元素的实例
   * @param {string} presetId 预设元素ID
   * @returns {UIElement}
   */
  createElement(presetId) {
    const preset = UI.presets[presetId]
    if (preset) {
      Script.deferredLoading = true
      const element = this._createElement(preset)
      Script.loadDeferredParameters()
      return element
    }
    throw new Error(`Invalid Element ID: ${presetId}`)
  }

  /**
   * 创建预设元素的实例(私有)
   * @param {Object} node 预设元素数据
   * @returns {UIElement}
   */
  _createElement(node) {
    // 编译元素事件
    if (Array.isArray(node.events)) {
      Data.compileEvents(node, `${node.ui.path}\n@ ${node.name}.${node.presetId}`)
    }
    const element = new UI.elementClassMap[node.class](node)
    for (const childNode of node.children) {
      // 创建子元素时忽略禁用的元素
      if (childNode.enabled) {
        element.appendChild(this._createElement(childNode))
      }
    }
    return element
  }

  /**
   * 创建预设元素的实例，并添加到跟元素
   * @param {string} presetId 预设元素ID
   * @returns {UIElement}
   */
  add(presetId) {
    const element = UI.createElement(presetId)
    UI.root.appendChild(element)
    return element
  }

  /** 更新元素 */
  update() {
    UI.manager.update()
    UI.updateKeyTurbo()
  }

  /** 渲染元素 */
  render() {
    UI.root.draw()
  }

  /** 重置界面，销毁所有元素 */
  reset() {
    UI.resetFocuses()
    UI.resetPointerEventRoots()
    const {children} = UI.root
    let i = children.length
    // 逆序删除根元素下的内容
    while (--i >= 0) {
      // 可能在销毁回调中销毁了其他元素
      // 因此做个有效性判断
      children[i]?.destroy()
    }
  }

  /**
   * 获取已经创建的元素实例(通过ID)
   * @param {string} presetId 预设元素ID
   * @returns {UIElement|undefined}
   */
  get(presetId) {
    return this.idMap[presetId]
  }

  /**
   * 获取指针事件根元素
   * @returns {UIElement}
   */
  getPointerEventRoot() {
    const roots = this.pointerEventRoots
    return roots[roots.length - 1] ?? this.root
  }

  /**
   * 添加指针事件根元素
   * @param {UIElement} element 根元素
   */
  addPointerEventRoot(element) {
    if (element instanceof UIElement) {
      this.pointerEventRoots.append(element)
    }
  }

  /**
   * 移除指针事件根元素
   * @param {UIElement} element 根元素
   */
  removePointerEventRoot(element) {
    if (element instanceof UIElement) {
      this.pointerEventRoots.remove(element)
    }
  }

  /** 移除最新的焦点 */
  removeLatestPointerEventRoot() {
    const roots = this.pointerEventRoots
    this.removePointerEventRoot(roots[roots.length - 1])
  }

  /** 重置指针事件根元素 */
  resetPointerEventRoots() {
    this.pointerEventRoots.length = 0
  }

  /**
   * 查找目标元素(通过屏幕坐标)
   * @param {UIElement[]} elements 元素列表
   * @param {number} x 屏幕X
   * @param {number} y 屏幕Y
   * @returns {UIElement|undefined}
   */
  find(elements, x, y) {
    // 越是后面的元素优先级越高，因此逆序查找
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i]
      if (element.visible) {
        switch (element.pointerEvents) {
          case 'enabled':
            // 如果启用了指针事件，且指针位于元素区域中，则作为备选，继续查找子元素
            if (element.isPointIn(x, y)) {
              return this.find(element.children, x, y) ?? element
            }
            continue
          case 'skipped':
            // 如果跳过指针事件，则当作该元素不存在
            if (element.isPointIn(x, y)) {
              const target = this.find(element.children, x, y)
              if (target) return target
            }
            continue
          case 'disabled':
            continue
        }
      }
    }
    return undefined
  }

  /**
   * 获取鼠标位置的元素
   * @returns {UIElement}
   */
  getElementAtMouse() {
    const root = UI.getPointerEventRoot()
    return UI.find(
      root.children,
      Input.mouse.screenX,
      Input.mouse.screenY,
    ) ?? root
  }

  /**
   * 更新事件冒泡状态(私有)
   * 如果选中了UI元素
   * 阻止事件传递到场景中
   * @param {UIElement} target
   */
  _updateBubbleState(target) {
    if (target !== UI.root &&
      target instanceof UIElement) {
      Input.bubbles.stop()
    }
  }

  /** 检查是否移除了hover元素 */
  checkIfRemovedHover(element) {
    let hover = this.hover
    // 如果删除的元素包含了hover元素
    // 删除前触发相关元素的鼠标离开事件
    if (element.contains(hover)) {
      this.hover = null
      const {parent} = element
      do {
        hover.emit('mouseleave', false)
        hover = hover.parent
      } while (hover !== parent)
    }
  }

  // 添加焦点
  addFocus(element) {
    if (element instanceof UIElement &&
      this.focuses.append(element)) {
      const focuses = this.focuses
      const focus = focuses[focuses.length - 2]
      this.getSelectedButton(focus)?.updateDisplayMode()
      this.selectDefaultButton()
      element.emit('focus', false)
    }
  }

  // 移除焦点
  removeFocus(element) {
    if (this.focuses.remove(element)) {
      this.restoreFocusedButtons(element)
      const focuses = this.focuses
      const focus = focuses[focuses.length - 1]
      this.getSelectedButton(focus)?.updateDisplayMode()
      element.emit('blur', false)
    }
  }

  // 移除最新的焦点
  removeLatestFocus() {
    const focuses = this.focuses
    this.removeFocus(focuses[focuses.length - 1])
  }

  // 获取最新的焦点
  getFocus() {
    const focuses = this.focuses
    return focuses[focuses.length - 1]
  }

  // 重置焦点
  resetFocuses() {
    while (this.focuses.length !== 0) {
      this.removeLatestFocus()
    }
  }

  // 从按钮列表中获取选中的按钮
  getSelectedButton(focusOrButtons) {
    let buttons
    if (focusOrButtons instanceof UIElement) {
      if (!this.focuses.includes(focusOrButtons)) return
      buttons = this.getFocusedButtons(focusOrButtons, true)
    } else if (focusOrButtons instanceof Array) {
      buttons = focusOrButtons
    } else {
      return
    }
    for (const button of buttons) {
      if (button.selected) {
        return button
      }
    }
    return undefined
  }

  // 获取选中按钮的索引
  getIndexOfSelectedButton(focus) {
    if (focus instanceof UIElement) {
      const buttons = this.getFocusedButtons(focus, true)
      const button = this.getSelectedButton(buttons)
      return buttons.indexOf(button)
    }
    return -1
  }

  // 获取聚焦的按钮
  getFocusedButtons(focus = null, allowActive = false) {
    if (!focus) {
      const focuses = this.focuses
      const length = focuses.length
      if (length === 0) {
        return Array.empty
      }
      focus = focuses[length - 1]
    }
    let invalid = false
    const fetch = (elements, mode) => {
      for (const element of elements) {
        if (element instanceof ButtonElement) {
          // 如果按钮正在被按下，返回空列表
          if (allowActive === false &&
            element.state === 'active') {
            invalid = true
            return
          }
          buttons.push(element)
        }
        if (mode === 'control-descendant-buttons') {
          fetch(element.children, mode)
        }
      }
    }
    const buttons = []
    fetch(focus.children, focus.focusMode)
    return invalid ? Array.empty : buttons
  }

  // 恢复聚焦的按钮
  restoreFocusedButtons(focus = null, exclusion = null) {
    const buttons = this.getFocusedButtons(focus, true)
    for (const button of buttons) {
      if (button !== exclusion) {
        button.restore()
      }
    }
  }

  // 恢复相关的按钮
  restoreRelatedButtons(button) {
    for (const focus of this.focuses) {
      if (focus.contains(button)) {
        this.restoreFocusedButtons(focus, button)
        return
      }
    }
  }

  // 选中按钮
  selectButton(button) {
    if (button instanceof ButtonElement) {
      const focuses = this.focuses
      for (let i = focuses.length - 1; i >= 0; i--) {
        const focus = focuses[i]
        if (focus.focusMode === 'control-descendant-buttons'
        ? focus.contains(button)
        : focus === button.parent) {
          this.restoreFocusedButtons(focus, button)
          break
        }
      }
      button.hover()
    }
  }

  // 选中默认按钮
  selectDefaultButton() {
    const buttons = this.getFocusedButtons()
    // 如果没有鼠标悬停中的按钮，选中第一个按钮
    if (!this.getSelectedButton(buttons)) {
      buttons[0]?.hover(false)
    }
  }

  // 通过角度选择按钮
  selectButtonByAngle(angle) {
    const buttons = this.getFocusedButtons()
    const length = buttons.length
    if (length === 0) {
      return
    }
    const selected = this.getSelectedButton(buttons)
    if (!selected) {
      return buttons[0]?.hover(true)
    }

    // 计算邻近按钮的距离成本
    const ANGLE_TOLERANCE = Math.PI / 3
    const ANGLE_WEIGHT = 1.25
    const costs = []
    const set = {}
    const sx = selected.x + selected.width / 2
    const sy = selected.y + selected.height / 2
    for (const button of buttons) {
      if (button === selected) {
        continue
      }
      const dx = button.x + button.width / 2
      const dy = button.y + button.height / 2
      const da = Math.atan2(dy - sy, dx - sx)
      let ra = Math.modRadians(da - angle)
      if (ra > ANGLE_TOLERANCE) {
        ra = Math.modRadians(angle - da)
        if (ra > ANGLE_TOLERANCE) {
          continue
        }
      }
      const distance = Math.dist(sx, sy, dx, dy)
      const cost = Math.round(distance * (Math.cos(ra) + Math.sin(ra) * ANGLE_WEIGHT))
      costs.push(cost)
      set[cost] = button
    }

    // 选中最邻近的按钮
    if (costs.length > 0) {
      let minCost = Infinity
      for (const cost of costs) {
        if (minCost > cost) {
          minCost = cost
        }
      }
      selected.restore()
      set[minCost].hover(true)
    }
  }

  // 通过方向键选择按钮
  selectButtonByDirKey(dirKey) {
    switch (dirKey) {
      case 'Up':
        this.selectButtonByAngle(-Math.PI / 2)
        break
      case 'Down':
        this.selectButtonByAngle(Math.PI / 2)
        break
      case 'Left':
        this.selectButtonByAngle(Math.PI)
        break
      case 'Right':
        this.selectButtonByAngle(0)
        break
    }
  }

  // 按下方向键
  pressDirKey(dirKey) {
    if (this.focuses.length === 0) return
    if (this.dirKey !== dirKey) {
      this.dirKey = dirKey
      this.turbo = false
      this.turboElapsed = 0
      this.selectButtonByDirKey(dirKey)
    }
  }

  // 弹起方向键
  releaseDirKey(dirKey) {
    if (this.dirKey === dirKey) {
      this.dirKey = ''
      this.turbo = false
      this.turboElapsed = 0
    }
  }

  // 确定
  pressConfirmKey() {
    const buttons = this.getFocusedButtons()
    const button = this.getSelectedButton(buttons)
    if (button instanceof ButtonElement) {
      button.emit('click')
    }
  }

  // 更新按键连发
  updateKeyTurbo() {
    if (this.dirKey === '') return
    this.turboElapsed += Time.rawDeltaTime
    switch (this.turbo) {
      case false:
        if (this.turboElapsed >= 500) {
          this.turboElapsed -= 500
          this.turbo = true
          this.selectButtonByDirKey(this.dirKey)
        }
        break
      case true:
        if (this.turboElapsed >= 100) {
          this.turboElapsed -= 100
          this.selectButtonByDirKey(this.dirKey)
        }
        break
    }
  }

  /**
   * 添加界面事件侦听器
   * @param {string} type 界面事件类型
   * @param {function} listener 回调函数
   * @param {boolean} [priority = false] 是否将该事件设为最高优先级
   */
  on(type, listener, priority = false) {
    const list = this.listeners[type]
    if (!list.includes(listener)) {
      if (priority) {
        list.unshift(listener)
      } else {
        list.push(listener)
      }
    }
  }

  /**
   * 移除界面事件侦听器(未使用)
   * @param {string} type 界面事件类型
   * @param {function} listener 回调函数
   */
  off(type, listener) {
    const group = this.listeners[type]
    const index = group.indexOf(listener)
    if (index !== -1) {
      const replacer = () => {}
      group[index] = replacer
      Callback.push(() => {
        group.remove(replacer)
      })
    }
  }

  /** 重新调整大小事件 */
  resize() {
    // 更新文本框元素中影子输入框的位置
    const inputs = document.getElementsByClassName('text-box-shadow-input')
    for (const input of inputs) input.target.calculateHTMLInputPosition()
  }

  /** 键盘按下事件 */
  keydown() {
    if (UI.focuses.length !== 0) {
      switch (Input.event.code) {
        case 'ArrowUp':
          Input.bubbles.stop()
          UI.pressDirKey('Up')
          break
        case 'ArrowDown':
          Input.bubbles.stop()
          UI.pressDirKey('Down')
          break
        case 'ArrowLeft':
          Input.bubbles.stop()
          UI.pressDirKey('Left')
          break
        case 'ArrowRight':
          Input.bubbles.stop()
          UI.pressDirKey('Right')
          break
        case 'Enter':
        case 'NumpadEnter':
        case 'Space':
          Input.bubbles.stop()
          UI.pressConfirmKey()
          break
        case 'Escape': {
          const element = UI.getFocus()
          if (element.focusCancelable) {
            Input.bubbles.stop()
            UI.removeLatestFocus()
          }
          break
        }
      }
      // 有可能在前面的操作中移除了焦点
      UI.getFocus()?.emit('keydown', false)
    }
  }

  /** 键盘弹起事件 */
  keyup() {
    if (UI.focuses.length !== 0) {
      switch (Input.event.code) {
        case 'ArrowUp':
          Input.bubbles.stop()
          UI.releaseDirKey('Up')
          break
        case 'ArrowDown':
          Input.bubbles.stop()
          UI.releaseDirKey('Down')
          break
        case 'ArrowLeft':
          Input.bubbles.stop()
          UI.releaseDirKey('Left')
          break
        case 'ArrowRight':
          Input.bubbles.stop()
          UI.releaseDirKey('Right')
          break
      }
      // 有可能在前面的操作中移除了焦点
      UI.getFocus()?.emit('keyup', false)
    }
  }

  /** 鼠标按下事件 */
  mousedown() {
    if (Input.event.button === 2 &&
      UI.getFocus()?.focusCancelable) {
      UI.removeLatestFocus()
      Input.bubbles.stop()
      return
    }
    const target = UI.getElementAtMouse()
    target.emit('mousedown', true)
    UI._updateBubbleState(target)
  }

  /** 鼠标左键按下事件 */
  mousedownLB() {
    UI.target = UI.getElementAtMouse()
    UI.target.emit('mousedownLB', true)
    UI._updateBubbleState(UI.target)
  }

  /** 鼠标右键按下事件 */
  mousedownRB() {
    const target = UI.getElementAtMouse()
    target.emit('mousedownRB', true)
    UI._updateBubbleState(target)
  }

  /** 鼠标弹起事件 */
  mouseup() {
    const target = UI.getElementAtMouse()
    target.emit('mouseup', true)
    UI._updateBubbleState(target)
  }

  /** 鼠标左键弹起事件 */
  mouseupLB() {
    const target = UI.getElementAtMouse()
    target.emit('mouseupLB', true)
    if (UI.target?.contains(target)) {
      Input.bubbles.push(true)
      target.emit('click', true)
      Input.bubbles.pop()
    }
    UI.target = null
    UI._updateBubbleState(target)
  }

  /** 鼠标右键弹起事件 */
  mouseupRB() {
    const target = UI.getElementAtMouse()
    target.emit('mouseupRB', true)
    UI._updateBubbleState(target)
  }

  /** 鼠标移动事件 */
  mousemove() {
    const last = UI.hover
    const hover = UI.getElementAtMouse()
    if (last !== hover) {
      if (last !== null && !last.contains(hover)) {
        let element = last
        do {
          element.emit('mouseleave', false)
          element = element.parent
        } while (element !== null && element !== hover)
      }
      if (hover !== null && !hover.contains(last)) {
        let element = hover
        do {
          element.emit('mouseenter', false)
          element = element.parent
        } while (element !== null && element !== last)
      }
      UI.hover = hover
    }
    hover.emit('mousemove', true)
    UI._updateBubbleState(hover)
  }

  /** 鼠标离开事件 */
  mouseleave() {
    if (UI.hover !== null) {
      UI.hover.emit('mouseleave', true)
      UI.hover = null
    }
  }

  /** 鼠标双击事件 */
  doubleclick() {
    if (UI.target !== null) {
      UI.target.emit('doubleclick', true)
      UI._updateBubbleState(UI.target)
    }
  }

  /** 鼠标滚轮事件 */
  wheel() {
    if (UI.hover !== null) {
      UI.hover.emit('wheel', true)
      UI._updateBubbleState(UI.hover)
    }
  }

  /** 手柄按钮按下事件 */
  gamepadbuttonpress() {
    if (UI.focuses.length !== 0) {
      switch (Controller.buttonName) {
        case 'Up':
          Input.bubbles.stop()
          UI.pressDirKey('Up')
          break
        case 'Down':
          Input.bubbles.stop()
          UI.pressDirKey('Down')
          break
        case 'Left':
          Input.bubbles.stop()
          UI.pressDirKey('Left')
          break
        case 'Right':
          Input.bubbles.stop()
          UI.pressDirKey('Right')
          break
        case 'A':
          Input.bubbles.stop()
          UI.pressConfirmKey()
          break
        case 'B': {
          const element = UI.getFocus()
          if (element.focusCancelable) {
            Input.bubbles.stop()
            UI.removeLatestFocus()
          }
          break
        }
      }
      // 有可能在前面的操作中移除了焦点
      UI.getFocus()?.emit('gamepadbuttonpress', false)
    }
  }

  /** 手柄按钮弹起事件 */
  gamepadbuttonrelease() {
    if (UI.focuses.length !== 0) {
      switch (Controller.buttonName) {
        case 'Up':
          Input.bubbles.stop()
          UI.releaseDirKey('Up')
          break
        case 'Down':
          Input.bubbles.stop()
          UI.releaseDirKey('Down')
          break
        case 'Left':
          Input.bubbles.stop()
          UI.releaseDirKey('Left')
          break
        case 'Right':
          Input.bubbles.stop()
          UI.releaseDirKey('Right')
          break
      }
      // 有可能在前面的操作中移除了焦点
      UI.getFocus()?.emit('gamepadbuttonrelease', false)
    }
  }

  /** 手柄左摇杆改变事件 */
  gamepadleftstickchange() {
    const stickAngle = Controller.states.LeftStickAngle
    if (stickAngle !== -1) {
      let stickDir = ''
      switch (Math.floor(Math.modDegrees(stickAngle + 45) / 90)) {
        case 0:
          stickDir = 'Right'
          break
        case 1:
          stickDir = 'Down'
          break
        case 2:
          stickDir = 'Left'
          break
        case 3:
          stickDir = 'Up'
          break
      }
      // 临时添加stickDir属性
      if (Controller.stickDir !== stickDir) {
        Controller.stickDir = stickDir
        UI.pressDirKey(stickDir)
      }
    } else {
      UI.releaseDirKey(Controller.stickDir)
      Controller.stickDir = ''
    }
    UI.getFocus()?.emit('gamepadleftstickchange', false)
  }

  /** 手柄右摇杆改变事件 */
  gamepadrightstickchange() {
    UI.getFocus()?.emit('gamepadrightstickchange', false)
  }
}

// ******************************** 元素基类 ********************************

class UIElement {
  /** 预设元素数据ID
   *  @type {string}
   */ presetId

  /** 元素名称
   *  @type {string}
   */ name

  /** 元素水平位置(自动计算值)
   *  @type {number}
   */ x

  /** 元素垂直位置(自动计算值)
   *  @type {number}
   */ y

  /** 元素宽度(自动计算值)
   *  @type {number}
   */ width

  /** 元素高度(自动计算值)
   *  @type {number}
   */ height

  /** 元素变换矩阵
   *  @type {Matrix}
   */ matrix

  /** 元素不透明度(自动计算值)
   *  @type {number}
   */ opacity

  /** 元素变换数据
   *  @type {Object}
   */ transform

  /** 父级元素对象
   *  @type {UIElement|null}
   */ parent

  /** 子元素列表
   *  @type {Array<UIElement>}
   */ children

  /** 元素可见性
   *  @type {boolean}
   */ visible

  /** 元素是否已经连接
   *  @type {boolean}
   */ connected

  /** 元素是否已激活指针事件
   *  @type {boolean}
   */ pointerEvents

  /** 元素属性映射表
   *  @type {Object}
   */ attributes

  /** 元素更新器模块列表
   *  @type {ModuleList}
   */ updaters

  /** 元素事件映射表
   *  @type {Object}
   */ events

  /** 元素脚本管理器
   *  @type {Script}
   */ script

  // 默认元素数据
  static defaultData = {
    presetId: '',
    name: '',
    pointerEvents: 'enabled',
    events: [],
    scripts: [],
    transform: {
      anchorX: 0,
      anchorY: 0,
      x: 0,
      x2: 0,
      y: 0,
      y2: 0,
      width: 0,
      width2: 0,
      height: 0,
      height2: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      opacity: 1,
    },
  }

  /**
   * @param {Object} data 预设元素数据
   */
  constructor(data) {
    this.presetId = data.presetId
    this.name = data.name
    this.x = 0
    this.y = 0
    this.width = 0
    this.height = 0
    this.matrix = new Matrix()
    this.opacity = 1
    this.transform = {...data.transform}
    this.parent = null
    this.children = []
    this.visible = true
    this.connected = false
    this.pointerEvents = data.pointerEvents
    this.attributes = {}
    this.updaters = new ModuleList()
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    UI.latest = this

    // 添加到ID->元素映射表
    if (this.presetId) {
      UI.idMap[this.presetId] = this
    }
  }

  /** 连接元素 */
  connect() {
    // 添加元素到管理器中
    UI.manager.append(this)
    this.connected = true
    this.connectChildren()
  }

  /** 断开元素 */
  disconnect() {
    // 从管理器中移除元素
    UI.manager.remove(this)
    this.connected = false
    this.disconnectChildren()
  }

  /** 连接所有子元素 */
  connectChildren() {
    const children = this.children
    const length = children.length
    for (let i = 0; i < length; i++) {
      children[i].connect()
    }
  }

  /** 断开所有子元素 */
  disconnectChildren() {
    const children = this.children
    const length = children.length
    for (let i = 0; i < length; i++) {
      children[i].disconnect()
    }
  }

  /** 绘制所有子元素 */
  drawChildren() {
    const children = this.children
    const length = children.length
    for (let i = 0; i < length; i++) {
      children[i].draw()
    }
  }

  /** 调整所有子元素 */
  resizeChildren() {
    const children = this.children
    const length = children.length
    for (let i = 0; i < length; i++) {
      children[i].resize()
    }
  }

  /** 销毁所有子元素 */
  destroyChildren() {
    const children = this.children
    let i = children.length
    while (--i >= 0) {
      children[i]?.destroy()
    }
  }

  /**
   * 添加多个子元素
   * @param {UIElement[]} elements 元素列表
   */
  appendChildren(elements) {
    for (const element of elements) {
      this.appendChild(element)
    }
  }

  /**
   * 添加子元素
   * @param {UIElement} element 元素
   */
  appendChild(element) {
    // 如果子元素列表添加了目标元素(过滤重复)
    if (element && this.children.append(element)) {
      // 解除子元素之前的父子关系
      element.parent?.children.remove(element)
      element.parent = this
      // 如果本元素已连接
      if (this.connected) {
        // 连接子元素并调整大小
        !element.connected &&
        element.connect()
        element.resize()
      } else {
        // 断开子元素连接
        element.connected &&
        element.disconnect()
      }
    }
  }

  /**
   * 插入子元素到目标元素前面
   * @param {UIElement} element 新插入的元素
   * @param {UIElement} destination 目标位置的元素
   */
  insertBefore(element, destination) {
    if (!element) return
    const pos = this.children.indexOf(destination)
    if (pos !== -1 && !this.children.includes(element)) {
      this.children.splice(pos, 0, element)
      // 解除子元素之前的父子关系
      element.parent?.children.remove(element)
      element.parent = this
      // 如果本元素已连接
      if (this.connected) {
        // 连接子元素并调整大小
        !element.connected &&
        element.connect()
        element.resize()
      } else {
        // 断开子元素连接
        element.connected &&
        element.disconnect()
      }
    }
  }

  /**
   * 将元素移动到父级列表中指定的索引位置
   * @param {number} pos 目标索引位置
   */
  moveToIndex(pos) {
    const {parent} = this
    if (parent) {
      const elements = parent.children
      const length = elements.length
      // 如果索引是负数，加上列表长度
      if (pos < 0) pos += length
      if (elements[pos] !== this &&
        elements[pos] !== undefined) {
        const index = elements.indexOf(this)
        const step = index < pos ? 1 : -1
        // 移动本元素到指定的索引位置
        for (let i = index; i !== pos; i += step) {
          elements[i] = elements[i + step]
        }
        elements[pos] = this
        // 如果父元素是窗口，请求重新调整大小
        if (parent instanceof WindowElement) {
          parent.requestResizing()
        }
      }
    }
  }

  /** 从父级元素中移除 */
  remove() {
    if (this.parent?.children.remove(this)) {
      UI.checkIfRemovedHover(this)
      if (this.parent instanceof WindowElement) {
        this.parent.requestResizing()
      }
      this.parent = null
      if (this.connected) {
        this.disconnect()
      }
    }
  }

  /**
   * 清除所有子元素
   * @returns {UIElement}
   */
  clear() {
    const {children} = this
    let i = children.length
    while (--i >= 0) {
      children[i]?.destroy()
    }
    return this
  }

  /**
   * 隐藏元素
   * @returns {UIElement}
   */
  hide() {
    if (this.visible) {
      this.visible = false
    }
    return this
  }

  /**
   * 显示元素
   * @returns {UIElement}
   */
  show() {
    if (!this.visible) {
      this.visible = true
      this.resize()
    }
    return this
  }

  /** 使用变换参数来计算元素的实际位置 */
  calculatePosition() {
    // 如果元素已断开连接，返回
    if (this.connected === false) {
      return
    }

    const parent = this.parent
    const matrix = this.matrix.set(parent.matrix)
    const transform = this.transform
    const parentWidth = parent.width
    const parentHeight = parent.height
    const x = parent.x + transform.x + transform.x2 * parentWidth
    const y = parent.y + transform.y + transform.y2 * parentHeight
    const width = Math.max(transform.width + transform.width2 * parentWidth, 0)
    const height = Math.max(transform.height + transform.height2 * parentHeight, 0)
    const anchorX = transform.anchorX * width
    const anchorY = transform.anchorY * height
    const rotation = transform.rotation
    const scaleX = transform.scaleX
    const scaleY = transform.scaleY
    const skewX = transform.skewX
    const skewY = transform.skewY
    const opacity = transform.opacity * parent.opacity

    // 写入计算值
    this.x = x - anchorX
    this.y = y - anchorY
    this.width = width
    this.height = height
    this.opacity = opacity

    // 矩阵变换：旋转
    if (rotation !== 0) {
      matrix.rotateAt(x, y, Math.radians(rotation))
    }
    // 矩阵变换：缩放
    if (scaleX !== 1 || scaleY !== 1) {
      matrix.scaleAt(x, y, scaleX, scaleY)
    }
    // 矩阵变换：倾斜
    if (skewX !== 0 || skewY !== 0) {
      matrix.skewAt(x, y, skewX, skewY)
    }
  }

  /**
   * 判断是否包含指定元素
   * @param {UIElement} element 目标元素
   * @returns {boolean}
   */
  contains(element) {
    while (element) {
      if (element === this) {
        return true
      }
      element = element.parent
    }
    return false
  }

  /**
   * 判断是否可见
   * @returns {boolean}
   */
  isVisible() {
    let element = this
    // 如果自己或祖先元素有一个不可见
    // 则本元素不可见，返回false
    while (element) {
      if (!element.visible) {
        return false
      }
      element = element.parent
    }
    return true
  }

  /**
   * 判断屏幕坐标点是否在元素区域内
   * @param {number} x 屏幕X
   * @param {number} y 屏幕Y
   * @returns {boolean}
   */
  isPointIn(x, y) {
    const W = this.width
    const H = this.height
    // 如果区域面积为0，返回false
    if (W * H === 0) {
      return false
    }

    const matrix = this.matrix
    const L = this.x
    const T = this.y
    const R = L + W
    const B = T + H
    const a = matrix[0]
    const b = matrix[1]
    const c = matrix[3]
    const d = matrix[4]
    const e = matrix[6]
    const f = matrix[7]
    const x1 = a * L + c * T + e - x
    const y1 = b * L + d * T + f - y
    const x2 = a * L + c * B + e - x
    const y2 = b * L + d * B + f - y
    const x3 = a * R + c * B + e - x
    const y3 = b * R + d * B + f - y
    const x4 = a * R + c * T + e - x
    const y4 = b * R + d * T + f - y
    const cross1 = x1 * y2 - y1 * x2
    const cross2 = x2 * y3 - y2 * x3
    const cross3 = x3 * y4 - y3 * x4
    const cross4 = x4 * y1 - y4 * x1
    return (
      cross1 * cross2 >= 0 &&
      cross2 * cross3 >= 0 &&
      cross3 * cross4 >= 0 &&
      cross4 * cross1 >= 0
    )
  }

  /**
   * 设置元素位置
   * @param {Object} transformProps 元素变换属性选项
   */
  set(transformProps) {
    for (const key of Object.keys(transformProps)) {
      this.transform[key] = transformProps[key]
    }
    this.resize()
  }

  /**
   * 移动元素
   * @param {Object} transformProps 元素变换属性选项
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  move(transformProps, easingId, duration) {
    // 转换属性词条的数据结构
    const propEntries = Object.entries(transformProps)
    // 允许多个过渡同时存在且不冲突
    const {updaters} = this
    let transitions = updaters.get('move')
    // 如果上一次的移动元素过渡未结束，获取过渡更新器列表
    if (transitions) {
      let ti = transitions.length
      while (--ti >= 0) {
        // 获取单个过渡更新器，检查属性词条
        const updater = transitions[ti]
        const entries = updater.entries
        let ei = entries.length
        while (--ei >= 0) {
          const key = entries[ei][0]
          for (const property of propEntries) {
            // 从上一次过渡的属性中删除与当前过渡重复的属性
            if (property[0] === key) {
              entries.splice(ei, 1)
              if (entries.length === 0) {
                transitions.splice(ti, 1)
              }
              break
            }
          }
        }
      }
    }

    // 如果存在过渡
    if (duration > 0) {
      if (!transitions) {
        // 如果不存在过渡更新器列表，新建一个
        transitions = this.transitions = new ModuleList()
        updaters.set('move', transitions)
      }
      const transform = this.transform
      const length = propEntries.length
      const entries = new Array(length)
      for (let i = 0; i < length; i++) {
        const [key, end] = propEntries[i]
        const start = transform[key]
        entries[i] = [key, start, end]
      }
      let elapsed = 0
      const easing = Easing.get(easingId)
      // 创建更新器并添加到过渡更新器列表中
      const updater = transitions.add({
        entries: entries,
        update: deltaTime => {
          elapsed += deltaTime
          const time = easing.map(elapsed / duration)
          for (const [key, start, end] of entries) {
            transform[key] = start * (1 - time) + end * time
          }
          // 限制不透明度的最大值，不让它溢出
          if (transform.opacity > 1) {
            transform.opacity = 1
          }
          // 如果当前更新器是最后一个，调整元素大小
          const last = transitions.length - 1
          if (updater === transitions[last]) {
            this.resize()
          }
          // 如果过渡结束，延迟移除更新器
          if (elapsed >= duration) {
            Callback.push(() => {
              transitions.remove(updater)
              // 如果过渡更新器列表为空，删除它
              if (transitions.length === 0) {
                updaters.delete('move')
              }
            })
          }
        }
      })
    } else {
      // 直接设置元素属性
      const transform = this.transform
      for (const [key, value] of propEntries) {
        transform[key] = value
      }
      this.resize()
      // 如果存在过渡更新器列表并为空，删除它
      if (transitions?.length === 0) {
        updaters.deleteDelay('move')
      }
    }
  }

  /**
   * 查询属性匹配的后代元素
   * @param {string} key 属性键
   * @param {any} value 属性值
   * @returns {UIElement|undefined}
   */
  query(key, value) {
    // 优先在自己的子元素列表中查找
    for (const element of this.children) {
      if (element[key] === value) return element
    }
    // 如果没有发现，继续深入查找
    for (const element of this.children) {
      const target = element.query(key, value)
      if (target !== undefined) return target
    }
    return undefined
  }

  /**
   * 调用元素事件
   * @param {string} type 元素事件类型
   * @param {boolean} [bubble] 是否传递事件
   * @returns {EventHandler|undefined}
   */
  callEvent(type, bubble = false) {
    const commands = this.events[type]
    if (commands) {
      const event = new EventHandler(commands)
      event.priority = true
      event.bubble = bubble
      event.triggerElement = this
      EventHandler.call(event, this.updaters)
      return event
    }
  }

  /**
   * 调用元素事件和脚本
   * @param {string} type 元素事件类型
   * @param {boolean} [bubble] 是否传递事件
   */
  emit(type, bubble = false) {
    this.callEvent(type, bubble)
    this.script.emit(type, this)
    // 如果启用了事件传递，且未被阻止
    if (bubble && Input.bubbles.get()) {
      this.parent?.emit(type, bubble)
    }
  }

  /** 销毁元素 */
  destroy() {
    if (this.connected) {
      this.remove()
    }
    this.emit('destroy', false)
    // 取消注册元素(通过ID和名称)
    const {idMap} = UI
    const {presetId} = this
    if (idMap[presetId] === this) {
      delete idMap[presetId]
    }
    // 移除按钮焦点和指针事件根元素(如果存在)
    UI.removeFocus(this)
    UI.removePointerEventRoot(this)
    this.destroyChildren()
  }
}

// ******************************** 根元素 ********************************

class RootElement extends UIElement {
  constructor() {
    super({
      presetId: '',
      name: '',
      pointerEvents: 'enabled',
      events: {},
      scripts: [],
    })
    this.connected = true
  }

  /** 绘制图像 */
  draw() {
    this.drawChildren()
  }

  /** 重新调整根元素 */
  resize() {
    this.x = 0
    this.y = 0
    this.width = GL.width / UI.scale
    this.height = GL.height / UI.scale
    this.matrix.reset().scale(UI.scale, UI.scale)
    this.resizeChildren()
  }

  /** 发送事件(空函数) */
  emit() {}
}

// ******************************** 图像元素 ********************************

class ImageElement extends UIElement {
  /** 元素图像纹理
   *  @type {ImageTexture|null}
   */ texture

  /** 图像翻转模式
   *  @type {string}
   */ flip

  /** 图像纹理水平偏移
   *  @type {number}
   */ shiftX

  /** 图像纹理垂直偏移
   *  @type {number}
   */ shiftY

  /** 图像切片边框宽度
   *  @type {number}
   */ border

  /** 图像矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 图像色调
   *  @type {Array<number>}
   */ tint

  /** 混合模式
   *  @type {string}
   */ blend

  _image    //:string
  _display  //:string

  // 公共属性
  static sharedFloat64Array = new Float64Array(4)

  // 默认图像元素数据
  static defaultData = {
    image: '',
    display: 'stretch',
    flip: 'none',
    blend: 'normal',
    shiftX: 0,
    shiftY: 0,
    clip: [0, 0, 32, 32],
    border: 1,
    tint: [0, 0, 0, 0],
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 图像元素数据
   */
  constructor(data = ImageElement.defaultData) {
    super(data)
    this.texture = null
    this.image = data.image
    this.display = data.display
    this.flip = data.flip
    this.shiftX = data.shiftX
    this.shiftY = data.shiftY
    this.border = data.border
    this.clip = [...data.clip]
    this.tint = [...data.tint]
    this.blend = data.blend
    this.emit('create')
  }

  /**
   * 图像文件ID或HTML图像元素
   * @type {string|HTMLImageElement}
   */
  get image() {
    return this._image
  }

  set image(value) {
    if (this._image !== value) {
      this._image = value
      // 如果存在纹理，销毁
      if (this.texture) {
        this.texture.destroy()
        this.texture = null
      }
      if (value) {
        this.texture = new ImageTexture(value)
      }
    }
  }

  /**
   * 图像显示模式
   * @type {string}
   */
  get display() {
    return this._display
  }

  set display(value) {
    this._display = value
  }

  /**
   * 加载Base64图像
   * @param {string} base64
   */
  loadBase64(base64) {
    if (GL.textureManager.images[base64]) {
      this.image = base64
    } else {
      const image = new Image()
      image.onload = () => {
        image.guid = base64
        this.image = image
      }
      image.src = base64
    }
  }

  /**
   * 设置图像剪辑
   * @param {string|HTMLImageElement} image 图像文件ID或HTML图像元素
   * @param {Array<number>} clip 图像裁剪区域
   */
  setImageClip(image, clip) {
    this.image = image
    this.display = 'clip'
    this.clip[0] = clip[0]
    this.clip[1] = clip[1]
    this.clip[2] = clip[2]
    this.clip[3] = clip[3]
  }

  /**
   * 设置图像色调
   * @param {Object} tint 图像色调属性选项{red?: -255~255, green?: -255~255, blue?: -255~255, gray?: 0~255}
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setTint(tint, easingId, duration) {
    const {red, green, blue, gray} = tint
    const {updaters} = this
    if (duration > 0) {
      let elapsed = 0
      const start = Array.from(this.tint)
      const easing = Easing.get(easingId)
      updaters.set('tint', {
        update: deltaTime => {
          elapsed += deltaTime
          const time = easing.map(elapsed / duration)
          const tint = this.tint
          if (Number.isFinite(red)) {
            tint[0] = Math.clamp(start[0] * (1 - time) + red * time, -255, 255)
          }
          if (Number.isFinite(green)) {
            tint[1] = Math.clamp(start[1] * (1 - time) + green * time, -255, 255)
          }
          if (Number.isFinite(blue)) {
            tint[2] = Math.clamp(start[2] * (1 - time) + blue * time, -255, 255)
          }
          if (Number.isFinite(gray)) {
            tint[3] = Math.clamp(start[3] * (1 - time) + gray * time, 0, 255)
          }
          // 如果过渡结束，延迟移除更新器
          if (elapsed >= duration) {
            updaters.deleteDelay('tint')
          }
        }
      })
    } else {
      if (Number.isFinite(red)) this.tint[0] = red
      if (Number.isFinite(green)) this.tint[1] = green
      if (Number.isFinite(blue)) this.tint[2] = blue
      if (Number.isFinite(gray)) this.tint[3] = gray
      // 如果存在色调更新器，延迟移除
      if (updaters.get('tint')) {
        updaters.deleteDelay('tint')
      }
    }
  }

  /** 绘制图像元素 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 绘制图片
    const {texture} = this
    if (texture?.complete) draw: {
      let dx = this.x
      let dy = this.y
      let dw = this.width
      let dh = this.height
      if (this.blend === 'mask') {
        if (GL.maskTexture.binding) {
          break draw
        }
        if (GL.depthTest) {
          GL.disable(GL.DEPTH_TEST)
        }
        GL.maskTexture.binding = this
        GL.bindFBO(GL.maskTexture.fbo)
        GL.alpha = 1
        GL.blend = 'normal'
      } else {
        GL.alpha = this.opacity
        GL.blend = this.blend
      }
      GL.matrix.set(this.matrix)
      // 图像显示模式
      switch (this.display) {
        case 'stretch':
          texture.clip(this.shiftX, this.shiftY, texture.base.width, texture.base.height)
          break
        case 'tile':
          texture.clip(this.shiftX, this.shiftY, this.width, this.height)
          break
        case 'clip':
          texture.clip(...this.clip)
          break
        case 'slice':
          GL.drawSliceImage(texture, dx, dy, dw, dh, this.clip, this.border, this.tint)
          break draw
      }
      // 图像翻转模式
      switch (this.flip) {
        case 'none':
          break
        case 'horizontal':
          dx += dw
          dw *= -1
          break
        case 'vertical':
          dy += dh
          dh *= -1
          break
        case 'both':
          dx += dw
          dy += dh
          dw *= -1
          dh *= -1
          break
      }
      GL.drawImage(texture, dx, dy, dw, dh, this.tint)
    }

    // 绘制子元素
    if (GL.maskTexture.binding === this) {
      GL.unbindFBO()
      if (GL.depthTest) {
        GL.enable(GL.DEPTH_TEST)
      }
      GL.masking = true
      this.drawChildren()
      GL.masking = false
      GL.maskTexture.binding = null
      // 擦除遮罩纹理缓冲区
      const [x1, y1, x2, y2] = this.computeBoundingRectangle()
      const sl = Math.max(Math.floor(x1 - 1), 0)
      const st = Math.max(Math.floor(y1 - 1), 0)
      const sr = Math.min(Math.ceil(x2 + 1), GL.maskTexture.width)
      const sb = Math.min(Math.ceil(y2 + 1), GL.maskTexture.height)
      const sw = sr - sl
      const sh = sb - st
      if (sw > 0 && sh > 0) {
        GL.bindFBO(GL.maskTexture.fbo)
        GL.enable(GL.SCISSOR_TEST)
        GL.scissor(sl, st, sw, sh)
        GL.clearColor(0, 0, 0, 0)
        GL.clear(GL.COLOR_BUFFER_BIT)
        GL.disable(GL.SCISSOR_TEST)
        GL.unbindFBO()
      }
    } else {
      this.drawChildren()
    }
  }

  /** 重新调整图像元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      this.resizeChildren()
    }
  }

  /** 销毁图像元素 */
  destroy() {
    this.texture?.destroy()
    return super.destroy()
  }

  // 计算外接矩形
  computeBoundingRectangle() {
    const matrix = this.matrix
    const L = this.x
    const T = this.y
    const R = L + this.width
    const B = T + this.height
    const a = matrix[0]
    const b = matrix[1]
    const c = matrix[3]
    const d = matrix[4]
    const e = matrix[6]
    const f = matrix[7]
    const x1 = a * L + c * T + e
    const y1 = b * L + d * T + f
    const x2 = a * L + c * B + e
    const y2 = b * L + d * B + f
    const x3 = a * R + c * B + e
    const y3 = b * R + d * B + f
    const x4 = a * R + c * T + e
    const y4 = b * R + d * T + f
    const vertices = ImageElement.sharedFloat64Array
    vertices[0] = Math.min(x1, x2, x3, x4)
    vertices[1] = Math.min(y1, y2, y3, y4)
    vertices[2] = Math.max(x1, x2, x3, x4)
    vertices[3] = Math.max(y1, y2, y3, y4)
    return vertices
  }
}

// ******************************** 文本元素 ********************************

class TextElement extends UIElement {
  /** 文字打印机纹理
   *  @type {Texture|null}
   */ texture

  /** 文字打印机
   *  @type {Printer|null}
   */ printer

  /** 是否自动换行
   *  @type {boolean}
   */ wordWrap

  /** 文字溢出时是否截断
   *  @type {boolean}
   */ truncate

  /** 文本宽度
   *  @type {number}
   */ textWidth

  /** 文本高度
   *  @type {number}
   */ textHeight

  /** 混合模式
   *  @type {string}
   */ blend

  // 私有属性
  _direction        //:string
  _horizontalAlign  //:string
  _verticalAlign    //:string
  _content          //:string
  _rawContent       //:string
  _size             //:number
  _style            //:string
  _weight           //:string
  _lineSpacing      //:number
  _letterSpacing    //:number
  _color            //:string
  _font             //:string
  _typeface         //:string
  _effect           //:object
  _overflow         //:string
  _textOuterX       //:number
  _textOuterY       //:number
  _textOuterWidth   //:number
  _textOuterHeight  //:number

  // 默认文本元素数据
  static defaultData = {
    direction: 'horizontal-tb',
    horizontalAlign: 'left',
    verticalAlign: 'middle',
    content: 'New Text',
    size: 16,
    lineSpacing: 0,
    letterSpacing: 0,
    color: 'ffffffff',
    font: '',
    typeface: 'regular',
    effect: {type: 'none'},
    overflow: 'visible',
    blend: 'normal',
    ...UIElement.defaultData,
  }

  // 全局变量正则表达式
  static globalVarRegexp = /<global:([0-9a-f]{16})>/g

  // 动态全局变量正则表达式
  static dynamicGlobalVarRegexp = /<global::([0-9a-f]{16})>/g

  // 编译动态文本内容
  static compileDynamicTextContent(content) {
    const regexp = this.dynamicGlobalVarRegexp
    if (regexp.test(content)) {
      regexp.lastIndex = 0
      const slices = []
      const setters = []
      let changed = false
      let li = 0
      let match
      while (match = regexp.exec(content)) {
        const mi = match.index
        if (mi > li) {
          slices.push(content.slice(li, mi))
        }
        const index = slices.length
        const key = match[1]
        const setter = () => {
          const value = Variable.get(key)
          if (slices[index] !== value) {
            slices[index] = value
            changed = true
          }
        }
        setters.push(setter)
        slices.push(null)
        li = regexp.lastIndex
      }
      // 结尾有多余文本的情况
      if (content.length > li) {
        slices.push(content.slice(li))
      }
      return {
        onChange: Function.empty,
        update() {
          for (const setter of setters) {
            setter()
          }
          if (changed) {
            changed = false
            this.onChange(slices.join(''))
          }
        }
      }
    }
    return null
  }

  // 变量文本替换器
  static variableTextReplacer = (match, varId) => Variable.get(varId)

  // 解析变量文本内容
  static parseVariableTextContent(content) {
    return content.replace(this.globalVarRegexp, this.variableTextReplacer)
  }

  /**
   * @param {Object} data 文本元素数据
   */
  constructor(data = TextElement.defaultData) {
    super(data)
    this.texture = null
    this.printer = null
    this.direction = data.direction
    this.horizontalAlign = data.horizontalAlign
    this.verticalAlign = data.verticalAlign
    this.content = TextElement.parseVariableTextContent(data.content)
    this.size = data.size
    this.lineSpacing = data.lineSpacing
    this.letterSpacing = data.letterSpacing
    this.color = data.color
    this.font = data.font
    this.typeface = data.typeface
    this.effect = {...data.effect}
    this.wordWrap = false
    this.truncate = false
    this.overflow = data.overflow
    this.textWidth = 0
    this.textHeight = 0
    this._textOuterX = 0
    this._textOuterY = 0
    this._textOuterWidth = 0
    this._textOuterHeight = 0
    this.blend = data.blend
    this.emit('create')
  }

  /**
   * 文本方向
   * @type {string}
   */
  get direction() {
    return this._direction
  }

  set direction(value) {
    if (this._direction !== value) {
      this._direction = value
      if (this.printer) {
        this.printer.reset()
        this.printer.direction = value
      }
    }
  }

  /**
   * 水平对齐
   * @type {string}
   */
  get horizontalAlign() {
    return this._horizontalAlign
  }

  set horizontalAlign(value) {
    if (this._horizontalAlign !== value) {
      switch (value) {
        case 'left':
        case 'center':
        case 'right':
          break
        default:
          return
      }
      this._horizontalAlign = value
      if (this.printer) {
        this.printer.reset()
        this.printer.horizontalAlign = value
      }
    }
  }

  /**
   * 垂直对齐
   * @type {string}
   */
  get verticalAlign() {
    return this._verticalAlign
  }

  // 写入垂直对齐
  set verticalAlign(value) {
    if (this._verticalAlign !== value) {
      switch (value) {
        case 'top':
        case 'middle':
        case 'bottom':
          break
        default:
          return
      }
      this._verticalAlign = value
      if (this.printer) {
        this.printer.reset()
        this.printer.verticalAlign = value
      }
    }
  }

  /**
   * 文本内容
   * @type {string}
   */
  get content() {
    return this._content
  }

  set content(value) {
    if (typeof value !== 'string') {
      value = value.toString()
    }
    if (this._rawContent !== value) {
      this._rawContent = value
      this._content = Local.replace(value)
      const updater = TextElement.compileDynamicTextContent(this._content)
      if (updater) {
        updater.onChange = content => {
          this._content = content
        }
        this.updaters.set('dynamic-var', updater)
      } else {
        this.updaters.delete('dynamic-var')
      }
    }
  }

  /**
   * 字体大小
   * @type {number}
   */
  get size() {
    return this._size
  }

  set size(value) {
    if (this._size !== value) {
      this._size = value
      if (this.printer) {
        this.printer.reset()
        this.printer.sizes[0] = value
      }
    }
  }

  /**
   * 行间距
   * @type {number}
   */
  get lineSpacing() {
    return this._lineSpacing
  }

  set lineSpacing(value) {
    if (this._lineSpacing !== value) {
      this._lineSpacing = value
      if (this.printer) {
        this.printer.reset()
        this.printer.lineSpacing = value
      }
    }
  }

  /**
   * 字间距
   * @type {number}
   */
  get letterSpacing() {
    return this._letterSpacing
  }

  set letterSpacing(value) {
    if (this._letterSpacing !== value) {
      this._letterSpacing = value
      if (this.printer) {
        this.printer.reset()
        this.printer.letterSpacing = value
      }
    }
  }

  /**
   * 文字颜色
   * @type {string}
   */
  get color() {
    return this._color
  }

  set color(value) {
    if (this._color !== value) {
      this._color = value
      if (this.printer) {
        this.printer.reset()
        this.printer.colors[0] = Color.parseCSSColor(value)
      }
    }
  }

  /**
   * 字体家族
   * @type {string}
   */
  get font() {
    return this._font
  }

  set font(value) {
    this._font = value
    if (this.printer) {
      this.printer.reset()
      this.printer.fonts[0] = Printer.generateFontFamily(value)
    }
  }

  /**
   * 字型
   * @type {string}
   */
  get typeface() {
    return this._typeface
  }

  set typeface(value) {
    if (this._typeface !== value) {
      switch (value) {
        case 'regular':
          this._style = 'normal'
          this._weight = 'normal'
          break
        case 'bold':
          this._style = 'normal'
          this._weight = 'bold'
          break
        case 'italic':
          this._style = 'italic'
          this._weight = 'normal'
          break
        case 'bold-italic':
          this._style = 'italic'
          this._weight = 'bold'
          break
        default:
          return
      }
      this._typeface = value
      if (this.printer) {
        this.printer.reset()
        this.printer.styles[0] = this._style
        this.printer.weights[0] = this._weight
      }
    }
  }

  /**
   * 文字效果
   * @type {Object}
   */
  get effect() {
    return this._effect
  }

  set effect(value) {
    this._effect = value
    if (this.printer) {
      this.printer.reset()
      this.printer.effects[0] = Printer.parseEffect(value)
    }
  }

  /**
   * 文字溢出模式
   * @type {string}
   */
  get overflow() {
    return this._overflow
  }

  set overflow(value) {
    if (this._overflow !== value) {
      this._overflow = value
      switch (value) {
        case 'visible':
          this.wordWrap = false
          this.truncate = false
          break
        case 'wrap':
          this.wordWrap = true
          this.truncate = false
          break
        case 'truncate':
          this.wordWrap = false
          this.truncate = true
          break
        case 'wrap-truncate':
          this.wordWrap = true
          this.truncate = true
          break
      }
      if (this.printer) {
        this.printer.reset()
        this.printer.wordWrap = this.wordWrap
        this.printer.truncate = this.truncate
      }
    }
  }

  /** 更新文本到打印机中 */
  update() {
    let printer = this.printer
    if (printer === null) {
      // 如果首次调用，创建打印机和纹理
      const texture = new Texture()
      printer = new Printer(texture)
      printer.direction = this.direction
      printer.horizontalAlign = this.horizontalAlign
      printer.verticalAlign = this.verticalAlign
      printer.sizes[0] = this.size
      printer.lineSpacing = this.lineSpacing
      printer.letterSpacing = this.letterSpacing
      printer.colors[0] = Color.parseCSSColor(this.color)
      printer.fonts[0] = this.font || Printer.font
      printer.styles[0] = this._style
      printer.weights[0] = this._weight
      printer.effects[0] = Printer.parseEffect(this.effect)
      printer.wordWrap = this.wordWrap
      printer.truncate = this.truncate
      this.texture = texture
      this.printer = printer
    }
    // 如果文本内容发生变化
    // 或者换行模式文本区域发生变化
    // 或者截断模式文本区域发生变化
    if (printer.content !== this._content ||
      printer.wordWrap && (printer.horizontal
      ? printer.printWidth !== this.width
      : printer.printHeight !== this.height) ||
      printer.truncate && (printer.horizontal
      ? printer.printHeight !== this.height
      : printer.printWidth !== this.width)) {
      // 更新打印机并绘制文本
      this.updatePrinter()
    }
  }

  // 更新文本内容
  updateTextContent() {
    const content = this._rawContent
    this._rawContent = ''
    this.content = content
  }

  // 更新打印机
  updatePrinter() {
    const {printer} = this
    if (!printer) return
    // 重置打印机
    if (printer.content) {
      printer.reset()
    }
    // 设置打印区域并打印文本
    printer.setPrintArea(this.width, this.height)
    printer.draw(this.content)
    this.calculateTextPosition()
  }

  /** 绘制文本元素 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 更新文本
    this.update()

    // 绘制文本
    if (this._content) {
      GL.alpha = this.opacity
      GL.blend = this.blend
      GL.matrix.set(this.matrix)
      GL.drawImage(this.texture, this._textOuterX, this._textOuterY, this._textOuterWidth, this._textOuterHeight)

      // 绘制内嵌图像元素
      for (const image of this.printer.images) {
        image.draw()
      }
    }

    // 绘制子元素
    this.drawChildren()
  }

  /** 重新调整文本元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      if (this.printer) {
        this.printer.images.changed = true
      }
      this.calculatePosition()
      this.calculateTextPosition()
      this.resizeChildren()
    }
  }

  /** 计算文本位置 */
  calculateTextPosition() {
    const printer = this.printer
    if (printer !== null) {
      const scale = Printer.scale
      const pl = printer.paddingLeft / scale
      const pt = printer.paddingTop / scale
      const pr = printer.paddingRight / scale
      const pb = printer.paddingBottom / scale
      const outerX = this.x - pl
      const outerY = this.y - pt
      const outerWidth = this.texture.width / scale
      const outerHeight = this.texture.height / scale
      const innerWidth = outerWidth - pl - pr
      const innerHeight = outerHeight - pt - pb
      const marginWidth = this.width - innerWidth
      const marginHeight = this.height - innerHeight
      const factorX = printer.alignmentFactorX
      const factorY = printer.alignmentFactorY
      const offsetX = marginWidth * factorX
      const offsetY = marginHeight * factorY
      this.textWidth = innerWidth
      this.textHeight = innerHeight
      this._textOuterX = outerX + offsetX
      this._textOuterY = outerY + offsetY
      this._textOuterWidth = outerWidth
      this._textOuterHeight = outerHeight

      // 调整内嵌图像元素
      this.resizeEmbeddedImages(offsetX, offsetY)
    }
  }

  /** 调整内嵌图像元素 */
  resizeEmbeddedImages(offsetX, offsetY) {
    const images = this.printer.images
    if (images.changed) {
      images.changed = false
      for (const image of images) {
        const transform = image.transform
        transform.x = image.startX + offsetX
        transform.y = image.startY + offsetY
        image.parent = this
        image.connected = true
        image.resize()
      }
    }
  }

  /** 销毁文本元素 */
  destroy() {
    this.texture?.destroy()
    this.printer?.destroy()
    return super.destroy()
  }
}

// ******************************** 文本框元素 ********************************

class TextBoxElement extends UIElement {
  /** HTML输入框元素(影子元素)
   *  @type {HTMLInputElement}
   */ input

  /** 元素是否正在聚焦状态
   *  @type {boolean}
   */ focusing

  /** 文字打印机纹理
   *  @type {Texture}
   */ texture

  /** 文字打印机
   *  @type {Printer}
   */ printer

  /** 数字输入框模式最小值
   *  @type {number}
   */ min

  /** 数字输入框模式最大值
   *  @type {number}
   */ max

  /** 数字输入框模式保留小数位
   *  @type {number}
   */ decimals

  /** 输入框的水平滚动距离
   *  @type {number}
   */ scrollLeft

  /** 输入框选中内容开始位置
   *  @type {number}
   */ selectionStart

  /** 输入框选中内容结束位置
   *  @type {number}
   */ selectionEnd

  // 私有属性
  _type                 //:string
  _align                //:string
  _padding              //:number
  _size                 //:number
  _font                 //:string
  _color                //:string
  _colorInt             //:number
  _textX                //:number
  _textY                //:number
  _textWidth            //:number
  _textShiftY           //:number
  _innerWidth           //:number
  _innerHeight          //:number
  _selectionLeft        //:number
  _selectionRight       //:number
  _selectionY           //:number
  _selectionHeight      //:number
  _selectionColor       //:string
  _selectionColorInt    //:number
  _selectionBgColor     //:string
  _selectionBgColorInt  //:number
  _cursorVisible        //:boolean
  _cursorElapsed        //:number

  // 静态 - 数值字符过滤器
  static numberFilter = /^(?:[-.\d]|-?(?:\d+)?\.?\d+)$/

  // 默认文本框元素数据
  static defaultData = {
    type: 'text',
    align: 'left',
    text: 'Content',
    maxLength: 16,
    number: 0,
    min: 0,
    max: 0,
    decimals: 0,
    padding: 4,
    size: 16,
    font: '',
    color: 'ffffffff',
    selectionColor: 'ffffffff',
    selectionBgColor: '0090ccff',
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 文本框元素数据
   */
  constructor(data = TextBoxElement.defaultData) {
    super(data)
    this.input = null
    this.focusing = false
    this.texture = new Texture()
    this.type = data.type
    this.align = data.align
    this.min = data.min
    this.max = data.max
    this.decimals = data.decimals
    this.padding = data.padding
    this.size = data.size
    this.font = data.font
    this.color = data.color
    this.scrollLeft = 0
    this.selectionStart = -1
    this.selectionEnd = -1
    this.selectionColor = data.selectionColor
    this.selectionBgColor = data.selectionBgColor
    this._cursorVisible = false
    this._cursorElapsed = null
    this.printer = new Printer(this.texture)
    this.printer.matchTag = Function.empty
    this.printer.sizes[0] = this.size
    this.printer.fonts[0] = this.font || Printer.font
    this.printer.colors[0] = '#ffffff'
    this.printer.effects[0] = {type: 'none'}
    this.createHTMLInputElement(data)
    this.emit('create')
  }

  /**
   * 文本框类型(文本|数值)
   * @type {string}
   */
  get type() {
    return this._type
  }

  set type(value) {
    if (this._type !== value) {
      this._type = value
      // 如果存在输入框且类型为数值，更新输入框的值
      if (this.input && value === 'number') {
        this.input.value = this.readInputNumber()
      }
    }
  }

  /** 文本内容 */
  get text() {
    if (this.type === 'text') {
      return this.input.value
    }
  }

  set text(value) {
    if (this.type === 'text') {
      this.input.value = value
    }
  }

  /** 数值内容 */
  get number() {
    if (this.type === 'number') {
      return this.readInputNumber()
    }
  }

  set number(value) {
    if (this.type === 'number') {
      this.input.value = value
      this.input.value = this.readInputNumber()
    }
  }

  /**
   * 对齐方式
   * @type {string}
   */
  get align() {
    return this._align
  }

  set align(value) {
    if (this._align !== value) {
      this._align = value
      if (this.connected) {
        this.calculateTextPosition()
      }
    }
  }

  /**
   * 内边距
   * @type {number}
   */
  get padding() {
    return this._padding
  }

  set padding(value) {
    if (this._padding !== value) {
      this._padding = value
      if (this.connected) {
        this.calculateTextPosition()
      }
    }
  }

  /**
   * 字体大小
   * @type {number}
   */
  get size() {
    return this._size
  }

  set size(value) {
    if (this._size !== value) {
      this._size = value
      if (this.printer) {
        this.printer.reset()
        this.printer.sizes[0] = value
      }
    }
  }

  /**
   * 字体家族
   * @type {string}
   */
  get font() {
    return this._font
  }

  set font(value) {
    this._font = value
    if (this.printer) {
      this.printer.reset()
      this.printer.fonts[0] = Printer.generateFontFamily(value)
    }
  }

  /**
   * 文字颜色
   * @type {string}
   */
  get color() {
    return this._color
  }

  set color(value) {
    if (this._color !== value) {
      this._color = value
      this._colorInt = Color.parseInt(value)
    }
  }

  /**
   * 选中文字颜色
   * @type {string}
   */
  get selectionColor() {
    return this._selectionColor
  }

  set selectionColor(value) {
    if (this._selectionColor !== value) {
      this._selectionColor = value
      this._selectionColorInt = Color.parseInt(value)
    }
  }

  /**
   * 选中背景颜色
   * @type {string}
   */
  get selectionBgColor() {
    return this._selectionBgColor
  }

  set selectionBgColor(value) {
    if (this._selectionBgColor !== value) {
      this._selectionBgColor = value
      this._selectionBgColorInt = Color.parseInt(value)
    }
  }

  /**
   * 创建HTML输入框元素
   * @param {Object} data 文本框元素数据
   */
  createHTMLInputElement(data) {
    const input = document.createElement('input')
    input.classList.add('text-box-shadow-input')
    // 创建影子输入框事件列表
    input.events = [
      ['keydown', this.keydownEvent.bind(this)],
      ['wheel', this.wheelEvent.bind(this)],
      ['beforeinput', this.beforeinputEvent.bind(this)],
      ['input', this.inputEvent.bind(this)],
      ['change', this.changeEvent.bind(this)],
      ['focus', this.focusEvent.bind(this)],
      ['blur', this.blurEvent.bind(this)],
    ]
    // 根据类型获取对应的初始值
    switch (data.type) {
      case 'text':
        input.value = data.text
        break
      case 'number':
        input.value = data.number.toString()
        break
    }
    input.target = this
    input.maxLength = data.maxLength
    input.style.boxSizing = 'border-box'
    input.style.position = 'fixed'
    input.style.fontFamily = this.printer.fonts[0]
    input.style.fontSize = `${this.printer.sizes[0]}px`
    input.style.padding = `${data.padding}px`
    input.style.textAlign = this.align
    // 将影子输入框设为透明，只是用来输入
    // 文字渲染用GL来实现，可以像素化渲染
    input.style.color = 'transparent'
    input.style.backgroundColor = 'transparent'
    input.style.border = 'none'
    input.style.outline = 'none'
    document.body.appendChild(this.input = input)
    // 逐帧检测祖先元素的可见性
    let shadowVisible = true
    this.updaters.add({
      update: () => {
        let visible = true
        let element = this
        do {
          if (element.visible === false) {
            visible = false
            break
          }
        }
        while (element = element.parent)
        // 如果可见性发生了变化
        if (shadowVisible !== visible) {
          shadowVisible = visible
          input.style.display = visible ? 'inherit' : 'none'
        }
      }
    })
    // 创建影子输入框样式
    if (!TextBoxElement.style) {
      const style = document.createElement('style')
      style.textContent = `
      .text-box-shadow-input::selection {
        color: transparent;
        background-color: transparent;
      }`
      document.head.appendChild(style)
      TextBoxElement.style = style
    }
  }

  /**
   * 输入框键盘按下事件
   * @param {KeyboardEvent} event 键盘事件
   */
  keydownEvent(event) {
    Input.keydownFilter(event)
    // 数值输入框：上下键进行数值微调
    if (this.type === 'number') {
      switch (event.code) {
        case 'ArrowUp':
          event.preventDefault()
          event.stopPropagation()
          this.fineTuneNumber(+1)
          break
        case 'ArrowDown':
          event.preventDefault()
          event.stopPropagation()
          this.fineTuneNumber(-1)
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          event.stopPropagation()
          break
        case 'Escape':
          event.stopPropagation()
          this.input.blur()
          break
      }
    }
  }

  /**
   * 输入框鼠标滚轮事件
   * @param {WheelEvent} event 滚轮事件
   */
  wheelEvent(event) {
    // 如果是数值输入框且获得焦点，滚轮滚动可微调数值
    if (this.type === 'number' && this.focusing) {
      this.fineTuneNumber(event.deltaY < 0 ? +1 : -1)
    }
  }

  /**
   * 输入框输入前事件
   * @param {InputEvent} event 输入事件
   */
  beforeinputEvent(event) {
    if (this.type === 'number' &&
      typeof event.data === 'string' &&
      !TextBoxElement.numberFilter.test(event.data)) {
      // 阻止在数值输入框中输入非法字符
      event.preventDefault()
    }
  }

  /** 输入框输入事件 */
  inputEvent() {
    const {printer, input} = this
    // 如果输入框内容发生变化，重置选中位置
    if (printer.content !== input.value) {
      this.selectionStart = null
      this.selectionEnd = null
      // 发送输入事件
      this.emit('input', false)
    }
  }

  /** 输入框改变事件 */
  changeEvent() {
    if (this.type === 'number') {
      // 如果是数值输入框，检查并重构数值
      const string = this.readInputNumber().toString()
      if (this.input.value !== string) {
        this.input.value = string
      }
    }
  }

  /** 输入框获得焦点事件 */
  focusEvent() {
    if (!this.focusing) {
      this.focusing = true
      this._cursorVisible = true
      this._cursorElapsed = 0
      // 发送获得焦点事件
      this.emit('focus', false)
    }
  }

  /** 输入框失去焦点事件 */
  blurEvent() {
    if (this.focusing) {
      this.focusing = false
      // 发送失去焦点事件
      this.emit('blur', false)
    }
  }

  /**
   * 微调输入框数值
   * @param {number} offset 数值偏差
   */
  fineTuneNumber(offset) {
    this.input.value = this.readInputNumber(offset).toString()
    this.inputEvent()
  }

  /**
   * 读取输入框数值
   * @param {number} offset 数值偏差
   * @returns {number}
   */
  readInputNumber(offset = 0) {
    const {input, min, max, decimals} = this
    const value = parseFloat(input.value) + offset || 0
    return Math.roundTo(Math.clamp(value, min, max), decimals)
  }

  /** 连接文本框元素 */
  connect() {
    super.connect()
    this.addEventListeners()
  }

  /** 断开文本框元素 */
  disconnect() {
    super.disconnect()
    this.removeEventListeners()
  }

  /** 添加事件侦听器 */
  addEventListeners() {
    const {input} = this
    if (!input) return
    for (const [type, listener] of input.events) {
      input.on(type, listener)
    }
  }

  /** 移除事件侦听器 */
  removeEventListeners() {
    const {input} = this
    if (!input) return
    for (const [type, listener] of input.events) {
      input.off(type, listener)
    }
  }

  /** 更新文本框 */
  update() {
    const {printer, input} = this
    const {context} = printer
    // 获取输入框滚动距离
    if (this.scrollLeft !== input.scrollLeft) {
      this.scrollLeft = input.scrollLeft
    }
    // 输入框的起始选中位置发生变化
    if (this.selectionStart !== input.selectionStart) {
      this.selectionStart = input.selectionStart
      if (this.selectionStart === this.selectionEnd) {
        // 如果选中长度为0：重置光标的状态
        this._selectionLeft = this._selectionRight
        this._cursorVisible = true
        this._cursorElapsed = 0
      } else if (this.selectionStart === 0) {
        // 如果起始选中位置在头部：左侧选中位置为0
        this._selectionLeft = 0
      } else {
        // 如果起始选中位置不在头部：测量选中位置前面文本的宽度作为左侧选中位置
        context.font = `${this.printer.sizes[0]}px ${this.printer.fonts[0]}`
        this._selectionLeft = context.measureText(input.value.slice(0, this.selectionStart)).width
      }
    }
    // 输入框的结束选中位置发生变化
    if (this.selectionEnd !== input.selectionEnd) {
      this.selectionEnd = input.selectionEnd
      if (this.selectionEnd === this.selectionStart) {
        // 如果选中长度为0：重置光标的状态
        this._selectionRight = this._selectionLeft
        this._cursorVisible = true
        this._cursorElapsed = 0
      } else {
        // 如果选中长度不为0：测量选中位置前面文本的宽度作为右侧选中位置
        context.font = `${this.printer.sizes[0]}px ${this.printer.fonts[0]}`
        this._selectionRight = context.measureText(input.value.slice(0, this.selectionEnd)).width
      }
    }
    // 如果输入框获得焦点，且选中长度为0，则显示闪烁的光标
    if (this.focusing && this.selectionStart === this.selectionEnd) {
      if ((this._cursorElapsed += Time.deltaTime) >= 500) {
        this._cursorVisible = !this._cursorVisible
        this._cursorElapsed -= 500
      }
    }

    // 如果输入框内容发生了变化，重新绘制文本
    if (printer.content !== input.value) {
      this.updatePrinter()
    }
  }

  // 更新打印机
  updatePrinter() {
    const {printer} = this
    if (!printer) return
    // 重置打印机
    if (printer.content) {
      printer.reset()
    }
    // 打印文本
    printer.draw(this.input.value)
    if (this.connected) {
      this.calculateTextPosition()
    }
  }

  /** 绘制文本框 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 更新数据
    this.update()

    // 设置上下文属性
    GL.alpha = this.opacity
    GL.blend = 'normal'
    GL.matrix.set(this.matrix)

    // 绘制文字纹理
    const {scale} = Printer
    const {texture} = this
    switch (this.focusing) {
      case false:
        // 文本框失去焦点的情况
        if (this.input.value) {
          // 绘制可见文本
          const sx = this.scrollLeft
          const sy = this._textShiftY
          const sw = Math.min(this._textWidth - sx, this._innerWidth)
          const sh = this._innerHeight
          texture.clip(sx * scale, sy * scale, sw * scale, sh * scale)
          GL.drawImageWithColor(texture, this._textX, this._textY, sw, sh, this._colorInt)
        }
        break
      case true: {
        // 文本框获得焦点的情况
        const SL = Math.floor(this._selectionLeft)
        const SR = Math.ceil(this._selectionRight)
        // 计算选中位置被裁剪后的左右边界位置
        const sl = Math.clamp(SL - this.scrollLeft, 0, this._innerWidth)
        const sr = Math.clamp(SR - this.scrollLeft, 0, this._innerWidth)
        if (this.selectionStart !== this.selectionEnd) {
          // 如果选中长度不为0
          // 先绘制选中区域的背景
          const dx = this._textX + sl
          const dy = this._selectionY
          const dw = sr - sl
          const dh = this._selectionHeight
          GL.fillRect(dx, dy, dw, dh, this._selectionBgColorInt)

          // 再分成三步绘制文本
          const sy = this._textShiftY
          const sh = this._innerHeight
          // 计算可见文本最右边的位置
          const tr = Math.min(this._textWidth - this.scrollLeft, this._innerWidth)
          if (0 < sl) {
            // 绘制选中位置左侧的可见文本
            const sx = this.scrollLeft
            const sw = sl
            texture.clip(sx * scale, sy * scale, sw * scale, sh * scale)
            GL.drawImageWithColor(texture, this._textX, this._textY, sw, sh, this._colorInt)
          }
          if (sl < sr) {
            // 绘制选中的可见文本(选中颜色)
            const sx = SL + Math.max(this.scrollLeft - SL, 0)
            const sw = sr - sl
            texture.clip(sx * scale, sy * scale, sw * scale, sh * scale)
            GL.drawImageWithColor(texture, this._textX + sl, this._textY, sw, sh, this._selectionColorInt)
          }
          if (sr < tr) {
            // 绘制选中位置右侧的可见文本
            const sx = SR
            const sw = tr - sr
            texture.clip(sx * scale, sy * scale, sw * scale, sh * scale)
            GL.drawImageWithColor(texture, this._textX + sr, this._textY, sw, sh, this._colorInt)
          }
        } else {
          // 如果选中长度为0
          if (this.input.value) {
            // 绘制可见文本
            const sx = this.scrollLeft
            const sy = this._textShiftY
            const sw = Math.min(this._textWidth - sx, this._innerWidth)
            const sh = this._innerHeight
            texture.clip(sx * scale, sy * scale, sw * scale, sh * scale)
            GL.drawImageWithColor(texture, this._textX, this._textY, sw, sh, this._colorInt)
          }

          // 绘制光标（撤销重做后不显示溢出的光标）
          if (this._cursorVisible && SL >= this.scrollLeft && SL <= this.scrollLeft + this._innerWidth) {
            const dx = this._textX + sl
            const dy = this._selectionY
            const dw = 1
            const dh = this._selectionHeight
            GL.fillRect(dx, dy, dw, dh, this._colorInt)
          }
        }
      }
    }

    // 绘制子元素
    this.drawChildren()
  }

  /**
   * 隐藏元素
   * @returns {TextBoxElement}
   */
  hide() {
    if (this.visible) {
      this.visible = false
      
    }
    return this
  }

  /**
   * 显示元素
   * @returns {TextBoxElement}
   */
  show() {
    if (!this.visible) {
      this.visible = true
      
      this.resize()
    }
    return this
  }

  /** 重新调整文本框元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      this.calculateTextPosition()
      this.calculateHTMLInputPosition()
      this.resizeChildren()
    }
  }

  /** 计算文本位置 */
  calculateTextPosition() {
    const scale = Printer.scale
    const printer = this.printer
    const size = printer.sizes[0]
    const vpadding = (this.height - size) / 2
    const paddingTop = printer.paddingTop / scale
    const textWidth = this.texture.base.width / scale
    const textHeight = this.texture.base.height / scale
    // 文本绘制位置
    this._textX = this.x + this.padding
    this._textY = this.y + Math.max(vpadding - paddingTop, 0)
    this._textWidth = textWidth
    // 文本纹理偏移Y
    this._textShiftY = Math.max(paddingTop - vpadding, 0)
    // 输入框内部宽高
    this._innerWidth = Math.max(this.width - this.padding * 2, 0)
    this._innerHeight = Math.min(this.height + this.y - this._textY, textHeight)
    // 选中区域Y和高度
    this._selectionY = this.y + Math.max(vpadding, 0)
    this._selectionHeight = Math.min(this.height, size)
    // 如果纹理宽度小于输入框宽度，则根据对齐模式进行偏移
    switch (this.align) {
      case 'center':
        if (textWidth < this._innerWidth) {
          this._textX += (this._innerWidth - textWidth) / 2
        }
        break
      case 'right':
        if (textWidth < this._innerWidth) {
          this._textX += this._innerWidth - textWidth + 1
        }
        break
    }
    // 绘制文本时像素对齐
    const scaleX = Math.max(this.transform.scaleX, 1)
    const scaleY = Math.max(this.transform.scaleY, 1)
    this._textX = Math.round(this._textX * scaleX) / scaleX
    this._textY = Math.round(this._textY * scaleY) / scaleY
  }

  /** 计算HTML输入框位置 */
  calculateHTMLInputPosition() {
    if (this.input !== null) {
      const offsetX = this.x + this.width / 2
      const offsetY = this.y + this.height / 2
      const matrix = Matrix.instance.reset()
      const mouse = Input.mouse
      // 根据屏幕是否旋转来计算矩阵
      switch (mouse.rotated) {
        case false:
          matrix
          .translate(mouse.left - offsetX, mouse.top - offsetY)
          .scale(1 / mouse.ratioX, 1 / mouse.ratioY)
          .multiply(this.matrix)
          .translate(offsetX, offsetY)
          break
        case true:
          matrix
          .translate(mouse.right - offsetX, mouse.top - offsetY)
          .rotate(Math.PI / 2)
          .scale(1 / mouse.ratioX, 1 / mouse.ratioY)
          .multiply(this.matrix)
          .translate(offsetX, offsetY)
          break
      }
      const a = matrix[0]
      const b = matrix[1]
      const c = matrix[3]
      const d = matrix[4]
      const e = matrix[6]
      const f = matrix[7]
      // 更新影子输入框的样式，让它与元素重合
      this.input.style.left = `${this.x}px`
      this.input.style.top = `${this.y}px`
      this.input.style.width = `${this.width}px`
      this.input.style.height = `${this.height}px`
      this.input.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
    }
  }

  /** 销毁文本框元素 */
  destroy() {
    this.texture?.destroy()
    if (this.input) {
      document.body.removeChild(this.input)
      if (this.connected) {
        this.removeEventListeners()
      }
      // 解除元素和DOM的绑定，让元素被垃圾回收
      // INPUT可能会在历史操作中保留一段时间
      this.input.events = null
      this.input.target = null
      this.input = null
    }
    return super.destroy()
  }
}

// ******************************** 对话框元素 ********************************

class DialogBoxElement extends UIElement {
  /** 对话框当前状态
   *  @type {string}
   */ state

  /** 文字打印机纹理
   *  @type {Texture|null}
   */ texture

  /** 文字打印机
   *  @type {Printer|null}
   */ printer

  /** 对话框已经播放的时间(毫秒)
   *  @type {number}
   */ elapsed

  /** 对话框打印文字的间隔时间(毫秒)
   *  @type {number}
   */ interval

  /** 对话框文字的水平结束位置
   *  @type {number}
   */ printEndX

  /** 对话框文字的垂直结束位置
   *  @type {number}
   */ printEndY

  /** 混合模式
   *  @type {string}
   */ blend

  // 私有属性
  _changed        //:boolean
  _content        //:string
  _rawContent     //:string
  _size           //:string
  _lineSpacing    //:string
  _letterSpacing  //:string
  _color          //:string
  _font           //:string
  _style          //:string
  _weight         //:string
  _typeface       //:string
  _effect         //:object
  _textOuterX      //:number
  _textOuterY      //:number
  _textOuterWidth  //:number
  _textOuterHeight //:number

  // 默认对话框元素数据
  static defaultData = {
    content: 'Content',
    interval: 16.6666,
    size: 16,
    lineSpacing: 0,
    letterSpacing: 0,
    color: 'ffffffff',
    font: '',
    typeface: 'regular',
    effect: {type: 'none'},
    blend: 'normal',
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 对话框元素数据
   */
  constructor(data = DialogBoxElement.defaultData) {
    super(data)
    this.state = 'complete'
    this.texture = null
    this.printer = null
    this.elapsed = 0
    this.interval = data.interval
    this.content = data.content
    this.size = data.size
    this.lineSpacing = data.lineSpacing
    this.letterSpacing = data.letterSpacing
    this.color = data.color
    this.font = data.font
    this.typeface = data.typeface
    this.effect = {...data.effect}
    this._textOuterX = 0
    this._textOuterY = 0
    this._textOuterWidth = 0
    this._textOuterHeight = 0
    this.printEndX = 0
    this.printEndY = 0
    this.blend = data.blend
    this.emit('create')
  }

  /**
   * 文本内容
   * @type {string}
   */
  get content() {
    return this._content
  }

  set content(value) {
    this._rawContent = value
    this._content = Local.replace(value)
    this._changed = true
    this.state = 'updating'
  }

  /**
   * 字体大小
   * @type {number}
   */
  get size() {
    return this._size
  }

  set size(value) {
    if (this._size !== value) {
      this._size = value
      if (this.printer) {
        this.reload()
        this.printer.sizes[0] = value
      }
    }
  }

  /**
   * 行间距
   * @type {number}
   */
  get lineSpacing() {
    return this._lineSpacing
  }

  set lineSpacing(value) {
    if (this._lineSpacing !== value) {
      this._lineSpacing = value
      if (this.printer) {
        this.reload()
        this.printer.lineSpacing = value
      }
    }
  }

  /**
   * 字间距
   * @type {number}
   */
  get letterSpacing() {
    return this._letterSpacing
  }

  set letterSpacing(value) {
    if (this._letterSpacing !== value) {
      this._letterSpacing = value
      if (this.printer) {
        this.reload()
        this.printer.letterSpacing = value
      }
    }
  }

  /**
   * 文字颜色
   * @type {string}
   */
  get color() {
    return this._color
  }

  set color(value) {
    if (this._color !== value) {
      this._color = value
      if (this.printer) {
        this.reload()
        this.printer.colors[0] = Color.parseCSSColor(value)
      }
    }
  }

  /**
   * 字体家族
   * @type {string}
   */
  get font() {
    return this._font
  }

  set font(value) {
    this._font = value
    if (this.printer) {
      this.reload()
      this.printer.fonts[0] = Printer.generateFontFamily(value)
    }
  }

  /**
   * 字型
   * @type {string}
   */
  get typeface() {
    return this._typeface
  }

  set typeface(value) {
    if (this._typeface !== value) {
      switch (value) {
        case 'regular':
          this._style = 'normal'
          this._weight = 'normal'
          break
        case 'bold':
          this._style = 'normal'
          this._weight = 'bold'
          break
        case 'italic':
          this._style = 'italic'
          this._weight = 'normal'
          break
        case 'bold-italic':
          this._style = 'italic'
          this._weight = 'bold'
          break
        default:
          return
      }
      this._typeface = value
      if (this.printer) {
        this.reload()
        this.printer.styles[0] = this._style
        this.printer.weights[0] = this._weight
      }
    }
  }

  /**
   * 文字效果
   * @type {Object}
   */
  get effect() {
    return this._effect
  }

  set effect(value) {
    this._effect = value
    if (this.printer) {
      this.reload()
      this.printer.effects[0] = Printer.parseEffect(value)
    }
  }

  /** 更新对话框 */
  update() {
    let printer = this.printer
    if (printer === null) {
      // 如果首次调用，创建打印机和纹理
      const texture = new Texture()
      printer = new Printer(texture)
      printer.sizes[0] = this.size
      // 为各种文字效果预留内边距
      printer.calculatePadding = Function.empty
      printer.lineSpacing = this.lineSpacing
      printer.letterSpacing = this.letterSpacing
      printer.colors[0] = Color.parseCSSColor(this.color)
      printer.fonts[0] = this.font || Printer.font
      printer.styles[0] = this._style
      printer.weights[0] = this._weight
      printer.effects[0] = Printer.parseEffect(this.effect)
      printer.wordWrap = true
      printer.truncate = true
      this.texture = texture
      this.printer = printer
      // 重写打印机加载图像方法（记录打印结束位置）
      printer.loadImage = (guid, clip, width, height) => {
        Printer.prototype.loadImage.call(printer, guid, clip, width, height)
        this.printEndX = printer.getRawX()
        this.printEndY = printer.getRawY()
      }
      // 删除打印机恢复纹理回调函数
      // 改用默认的恢复普通纹理方法（不完美）
      delete texture.base.onRestore
    }

    // 如果文本区域发生变化
    if (printer.printWidth !== this.width ||
      printer.printHeight !== this.height) {
      this.updatePrinter()
    }

    // 如果文本发生改变，且未被暂停，重新加载打印机内容
    if (this._changed && this.state !== 'paused') {
      this._changed = false
      this.reload()
    }

    // 如果处于更新中状态，打印文字
    if (this.state === 'updating') {
      this.print()
    }
  }

  // 更新文本内容
  updateTextContent() {
    this.content = this._rawContent
  }

  // 更新打印机
  updatePrinter() {
    const {printer} = this
    if (!printer) return
    if (printer.content) {
      printer.reset()
    }
    const pl = 20 * Printer.scale
    const pt = 50 * Printer.scale
    const pr = 110 * Printer.scale
    const pb = 50 * Printer.scale
    const width = Math.min(Math.ceil(this.width * Printer.scale + pl + pr), 16384)
    const height = Math.min(Math.ceil(this.height * Printer.scale + pt + pb), 16384)
    printer.setPadding(pl, pt, pr, pb)
    printer.setPrintArea(this.width, this.height)
    printer.texture.resize(width, height)
    printer.context.resize(width, height)
    this.calculateTextPosition()
    this._changed = true
  }

  /** 重新加载文本内容 */
  reload() {
    const {printer} = this
    // 重置打印机并清除纹理
    if (printer.content) {
      printer.reset()
      printer.context.clear()
    }
    // 设置打印机内容，切换到更新中状态
    printer.content = this.content
    this.state = 'updating'
  }

  /** 暂停打印文字 */
  pause() {
    if (this.state === 'updating') {
      this.state = 'paused'
    }
  }

  /** 继续打印文字 */
  continue() {
    if (this.state === 'paused') {
      this.state = 'updating'
    }
  }

  /** 立即打印文字 */
  printImmediately() {
    if (this.state === 'updating') {
      // 暂时取消打印间隔
      const {interval} = this
      this.interval = 0
      this.update()
      this.interval = interval
    }
  }

  /** 打印下一页文字 */
  printNextPage() {
    if (this.state !== 'complete') {
      this.state = 'updating'
      this.printer.x = 0
      this.printer.y = 0
      this.printer.context.clear()
      this.printer.images.length = 0
    }
  }

  /** 绘制缓冲字符串 */
  drawBuffer() {
    const {printer} = this
    // 当缓冲字符串不为空时绘制并记录结束位置
    if (printer.buffer !== '') {
      printer.drawBuffer()
      this.printEndX = this.printer.getRawX()
      this.printEndY = this.printer.getRawY()
    }
  }

  /** 打印文字 */
  print() {
    let count = Infinity
    if (this.interval !== 0) {
      this.elapsed += Time.rawDeltaTime
      // 如果存在打印间隔，计算当前帧可打印字符数量
      if (count = Math.floor(this.elapsed / this.interval)) {
        this.elapsed -= this.interval * count
      } else {
        return
      }
    }
    const printer = this.printer
    const content = printer.content
    const printWidth = printer.getScaledPrintWidth()
    const printHeight = printer.getScaledPrintHeight()
    const letterSpacing = printer.getScaledLetterSpacing()
    const charWidths = Printer.charWidths
    const length = content.length
    let charIndex = 0
    let charWidth = 0

    // 创建指令列表
    printer.commands = []

    // 更新字体
    printer.updateFont()

    // 按顺序检查字符
    while (printer.index < length) {
      // 匹配标签(在数量检查之前解析掉尾部标签)
      const char = content[printer.index]
      if (char === '<' && printer.matchTag()) {
        continue
      }

      // 检查待打印文字数量
      if (count === 0) {
        break
      }

      // 换行符
      if (char === '\n') {
        this.drawBuffer()
        printer.newLine()
        printer.index += 1
        continue
      }

      // 库存文本溢出
      if (Printer.wordWrap === 'keep' && printer.index >= printer.wrapEnd && printer.isWrapOverflowing()) {
        this.drawBuffer()
        printer.newLine()
        continue
      }

      // 跳出循环
      if (printer.y + Math.max(printer.lineHeight, printer.measureHeight(char)) > printHeight) {
        this.drawBuffer()
        this.state = 'waiting'
        break
      }

      // 强制换行
      if (printer.x + Printer.lineWidth + (charWidth = printer.measureWidth(char)) > printWidth) {
        this.drawBuffer()
        printer.newLine(true)
        continue
      }

      // 计算字间距相关数据
      if (letterSpacing !== 0) {
        charWidths[charIndex++] = charWidth
        Printer.lineWidth += letterSpacing
      }
      Printer.lineWidth += charWidth

      // 放入缓冲区
      printer.buffer += char
      printer.index += 1
      count--
    }

    // 设置完成状态
    if (printer.index === length) {
      this.state = 'complete'
    }

    // 绘制缓冲字符串
    this.drawBuffer()

    // 执行打印机指令进行绘制
    printer.executeCommands()
  }

  /** 绘制对话框 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 更新文本
    this.update()

    // 绘制文本
    if (this.content) {
      GL.alpha = this.opacity
      GL.blend = this.blend
      GL.matrix.set(this.matrix)
      GL.drawImage(this.texture, this._textOuterX, this._textOuterY, this._textOuterWidth, this._textOuterHeight)

      // 调整内嵌图像元素
      this.resizeEmbeddedImages()

      // 绘制内嵌图像元素
      for (const image of this.printer.images) {
        image.draw()
      }
    }

    // 绘制子元素
    this.drawChildren()
  }

  /** 重新调整对话框元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      if (this.printer) {
        this.printer.images.changed = true
      }
      this.calculatePosition()
      this.calculateTextPosition()
      this.resizeChildren()
    }
  }

  /** 计算文本位置 */
  calculateTextPosition() {
    const printer = this.printer
    if (printer !== null) {
      const scale = Printer.scale
      this._textOuterX = this.x - printer.paddingLeft / scale
      this._textOuterY = this.y - printer.paddingTop / scale
      this._textOuterWidth = this.texture.width / scale
      this._textOuterHeight = this.texture.height / scale
    }
  }

  /** 调整内嵌图像元素 */
  resizeEmbeddedImages() {
    const images = this.printer.images
    if (images.changed) {
      images.changed = false
      for (const image of images) {
        image.parent = this
        image.connected = true
        image.resize()
      }
    }
  }

  /** 销毁对话框元素 */
  destroy() {
    this.texture?.destroy()
    this.printer?.destroy()
    return super.destroy()
  }
}

// ******************************** 进度条元素 ********************************

class ProgressBarElement extends UIElement {
  /** 进度条元素图像纹理
   *  @type {ImageElement|null}
   */ texture

  /** 进度条图像显示模式(拉伸|裁剪)
   *  @type {string}
   */ display

  /** 进度条图像矩形裁剪区域
   *  @type {Array<number>}
   */ clip

  /** 进度条类型(水平|垂直|圆形)
   *  @type {string}
   */ type

  /** 进度条步长
   *  @type {number}
   */ step

  /** 圆形模式中心水平位置
   *  @type {number}
   */ centerX

  /** 圆形模式中心垂直位置
   *  @type {number}
   */ centerY

  /** 圆形模式开始角度(弧度)
   *  @type {number}
   */ startAngle

  /** 圆形模式结束角度(弧度)
   *  @type {number}
   */ centralAngle

  /** 进度值(0-1)
   *  @type {number}
   */ progress

  /** 颜色模式(纹理采样|固定)
   *  @type {string}
   */ colorMode

  /** 固定颜色数组
   *  @type {Array<number>}
   */ color

  /** 混合模式
   *  @type {string}
   */ blend

  // 私有属性
  _image //:string

  // 默认进度条元素数据
  static defaultData = {
    image: '',
    display: 'stretch',
    clip: [0, 0, 32, 32],
    type: 'horizontal',
    centerX: 0.5,
    centerY: 0.5,
    startAngle: -90,
    centralAngle: 360,
    step: 0,
    progress: 1,
    blend: 'normal',
    colorMode: 'texture',
    color: [0, 0, 0, 0],
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 进度条元素数据
   */
  constructor(data = ProgressBarElement.defaultData) {
    super(data)
    this.texture = null
    this.image = data.image
    this.display = data.display
    this.clip = [...data.clip]
    this.type = data.type
    this.step = data.step
    this.centerX = data.centerX
    this.centerY = data.centerY
    this.startAngle = data.startAngle
    this.centralAngle = data.centralAngle
    this.progress = data.progress
    this.colorMode = data.colorMode
    this.color = new Uint8ClampedArray(data.color)
    this.blend = data.blend
    this.emit('create')
  }

  /**
   * 图像文件ID或HTML图像元素
   * @type {string|HTMLImageElement}
   */
  get image() {
    return this._image
  }

  set image(value) {
    if (this._image !== value) {
      this._image = value
      // 如果存在纹理，销毁
      if (this.texture) {
        this.texture.destroy()
        this.texture = null
      }
      if (value) {
        this.texture = new ImageTexture(value)
      }
    }
  }

  /** 绘制进度条元素 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 绘制进度条
    const {texture} = this
    if (this.progress > 0 && texture?.complete) {
      const {base} = texture
      // 进度条显示模式
      switch (this.display) {
        case 'stretch':
          texture.clip(0, 0, base.width, base.height)
          break
        case 'clip':
          texture.clip(...this.clip)
          break
      }
      const scaleX = this.width / texture.width
      const scaleY = this.height / texture.height
      // 计算原始比例下的进度条绘制顶点数据
      const {vertices, vertexLength, drawingLength} =
      this.calculateProgressVertices()

      // 绘制图像
      GL.blend = this.blend
      GL.alpha = this.opacity
      const matrix = Matrix.instance.project(
        GL.flip,
        GL.width,
        GL.height,
      )
      .multiply(this.matrix)
      .translate(this.x, this.y)
      .scale(scaleX, scaleY)
      const program = GL.imageProgram.use()
      GL.bindVertexArray(program.vao.a110)
      GL.vertexAttrib1f(program.a_Opacity, 1)
      GL.uniformMatrix3fv(program.u_Matrix, false, matrix)
      GL.uniform1i(program.u_LightMode, 0)
      // 进度条颜色模式
      switch (this.colorMode) {
        case 'texture':
          GL.uniform1i(program.u_ColorMode, 0)
          GL.uniform4f(program.u_Tint, 0, 0, 0, 0)
          break
        case 'fixed': {
          const color = this.color
          const red = color[0] / 255
          const green = color[1] / 255
          const blue = color[2] / 255
          const alpha = color[3] / 255
          GL.uniform1i(program.u_ColorMode, 1)
          GL.uniform4f(program.u_Color, red, green, blue, alpha)
          break
        }
      }
      GL.bufferData(GL.ARRAY_BUFFER, vertices, GL.STREAM_DRAW, 0, vertexLength)
      GL.bindTexture(GL.TEXTURE_2D, base.glTexture)
      GL.drawArrays(GL.TRIANGLE_FAN, 0, drawingLength)
    }

    // 绘制子元素
    this.drawChildren()
  }

  /** 计算进度条绘制用的顶点数据 */
  calculateProgressVertices() {
    const type = this.type
    const progress = Math.clamp(this.progress, 0, 1)
    const texture = this.texture
    const x = texture.x
    const y = texture.y
    const w = texture.width
    const h = texture.height
    const tw = texture.base.width
    const th = texture.base.height
    const response = ProgressBarElement.response
    const vertices = response.vertices
    const step = this.step
    switch (type) {
      case 'horizontal': {
        // 水平模式：从左到右
        let sw = w * progress
        let sh = h
        if (step !== 0) {
          // 如果存在步长，调整进度条宽度
          sw = Math.round(sw / step) * step
          sw = Math.clamp(sw, 0, w)
        }
        const dl = 0
        const dt = 0
        const dr = sw
        const db = sh
        const sl = x / tw
        const st = y / th
        const sr = (x + sw) / tw
        const sb = (y + sh) / th
        vertices[0] = dl
        vertices[1] = dt
        vertices[2] = sl
        vertices[3] = st
        vertices[4] = dl
        vertices[5] = db
        vertices[6] = sl
        vertices[7] = sb
        vertices[8] = dr
        vertices[9] = db
        vertices[10] = sr
        vertices[11] = sb
        vertices[12] = dr
        vertices[13] = dt
        vertices[14] = sr
        vertices[15] = st
        response.vertexLength = 16
        response.drawingLength = 4
        return response
      }
      case 'vertical': {
        // 垂直模式：从下到上
        let sw = w
        let sh = h * progress
        if (step !== 0) {
          // 如果存在步长，调整进度条高度
          sh = Math.round(sh / step) * step
          sh = Math.clamp(sh, 0, h)
        }
        const dl = 0
        const dt = h - sh
        const dr = sw
        const db = h
        const sl = x / tw
        const st = (y + dt) / th
        const sr = (x + sw) / tw
        const sb = (y + h) / th
        vertices[0] = dl
        vertices[1] = dt
        vertices[2] = sl
        vertices[3] = st
        vertices[4] = dl
        vertices[5] = db
        vertices[6] = sl
        vertices[7] = sb
        vertices[8] = dr
        vertices[9] = db
        vertices[10] = sr
        vertices[11] = sb
        vertices[12] = dr
        vertices[13] = dt
        vertices[14] = sr
        vertices[15] = st
        response.vertexLength = 16
        response.drawingLength = 4
        return response
      }
      case 'round': {
        // 圆形模式：
        // 圆心角是正数 = 顺时针方向
        // 圆心角是负数 = 逆时针方向
        const angles = response.angles
        const array = response.array
        let startAngle = this.startAngle
        let centralAngle = this.centralAngle
        let currentAngle = centralAngle * progress
        if (step !== 0) {
          // 如果存在步长，调整进度条角度
          currentAngle = Math.round(currentAngle / step) * step
          currentAngle = centralAngle >= 0
          ? Math.min(currentAngle, centralAngle)
          : Math.max(currentAngle, centralAngle)
        }
        if (currentAngle < 0) {
          // 如果当前角度是负数，取相反数
          // 并且把结束角度作为起始角度
          currentAngle = -currentAngle
          startAngle -= currentAngle
        }
        startAngle = Math.radians(startAngle)
        currentAngle = Math.radians(currentAngle)
        // 准备生成三角扇顶点数据
        const dl = 0
        const dt = 0
        const dr = w
        const db = h
        const dox = w * this.centerX
        const doy = h * this.centerY
        const tox = dox + x
        const toy = doy + y
        const sox = tox / tw
        const soy = toy / th
        const sl = x / tw
        const st = y / th
        const sr = (x + w) / tw
        const sb = (y + h) / th
        // 计算起始角到四个矩形角顶点的顺时针角度
        angles[0] = Math.modRadians(Math.atan2(dt - doy, dr - dox) - startAngle)
        angles[1] = Math.modRadians(Math.atan2(db - doy, dr - dox) - startAngle)
        angles[2] = Math.modRadians(Math.atan2(db - doy, dl - dox) - startAngle)
        angles[3] = Math.modRadians(Math.atan2(dt - doy, dl - dox) - startAngle)
        // 第一个顶点设置为起点
        vertices[0] = dox
        vertices[1] = doy
        vertices[2] = sox
        vertices[3] = soy
        // 查找起始角度顺时针方向第一个矩形角
        let minimum = angles[0]
        let startIndex = 0
        for (let i = 1; i < 4; i++) {
          if (angles[i] < minimum) {
            minimum = angles[i]
            startIndex = i
          }
        }
        // 从第三个顶点开始
        let vi = 8
        let endIndex = startIndex
        for (let i = 0; i < 4; i++) {
          // 从起始角到当前角顺时针连接三角扇顶点
          const index = (startIndex + i) % 4
          if (angles[index] < currentAngle) {
            switch (index) {
              case 0: // 右上
                vertices[vi    ] = dr
                vertices[vi + 1] = dt
                vertices[vi + 2] = sr
                vertices[vi + 3] = st
                break
              case 1: // 右下
                vertices[vi    ] = dr
                vertices[vi + 1] = db
                vertices[vi + 2] = sr
                vertices[vi + 3] = sb
                break
              case 2: // 左下
                vertices[vi    ] = dl
                vertices[vi + 1] = db
                vertices[vi + 2] = sl
                vertices[vi + 3] = sb
                break
              case 3: // 左上
                vertices[vi    ] = dl
                vertices[vi + 1] = dt
                vertices[vi + 2] = sl
                vertices[vi + 3] = st
                break
            }
            vi += 4
          } else {
            // 记录结束点索引
            endIndex = index
            break
          }
        }
        // 设置起始角度和边、顶点索引
        array[0] = startAngle
        array[1] = startIndex
        array[2] = 4
        // 设置结束角度和边、顶点索引
        array[3] = startAngle + currentAngle
        array[4] = endIndex
        array[5] = vi
        // 补充第二个和最后一个顶点数据
        for (let i = 0; i < 6; i += 3) {
          const angle = array[i]
          const side = array[i + 1]
          const vi = array[i + 2]
          switch (side) {
            case 0: { // 顶点位于上边
              const x = Math.tan(angle + Math.PI * 0.5) * doy
              const dx = (dox + x)
              const sx = (tox + x) / tw
              vertices[vi    ] = dx
              vertices[vi + 1] = dt
              vertices[vi + 2] = sx
              vertices[vi + 3] = st
              break
            }
            case 1: { // 顶点位于右边
              const y = Math.tan(angle) * (w - dox)
              const dy = (doy + y)
              const sy = (toy + y) / th
              vertices[vi    ] = dr
              vertices[vi + 1] = dy
              vertices[vi + 2] = sr
              vertices[vi + 3] = sy
              break
            }
            case 2: { // 顶点位于下边
              const x = Math.tan(angle - Math.PI * 0.5) * (h - doy)
              const dx = (dox - x)
              const sx = (tox - x) / tw
              vertices[vi    ] = dx
              vertices[vi + 1] = db
              vertices[vi + 2] = sx
              vertices[vi + 3] = sb
              break
            }
            case 3: { // 顶点位于左边
              const y = Math.tan(angle - Math.PI) * dox
              const dy = (doy - y)
              const sy = (toy - y) / th
              vertices[vi    ] = dl
              vertices[vi + 1] = dy
              vertices[vi + 2] = sl
              vertices[vi + 3] = sy
              break
            }
          }
        }
        const drawingLength = vi / 4 + 1
        response.vertexLength = drawingLength * 4
        response.drawingLength = drawingLength
        return response
      }
    }
  }

  /** 重新调整进度条元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      this.resizeChildren()
    }
  }

  /** 销毁进度条元素 */
  destroy() {
    this.texture?.destroy()
    return super.destroy()
  }

  // 静态 - 绘图用返回数据
  static response = {
    vertices: new Float32Array(28),
    angles: new Float64Array(4),
    array: new Float64Array(6),
    vertexLength: null,
    drawingLength: null,
  }
}

// ******************************** 按钮元素 ********************************

class ButtonElement extends UIElement {
  _displayMode  //:string
  _mode         //:string
  state         //:string
  selected      //:boolean
  shadowImage   //:element
  shadowText    //:element
  shadowScript  //:object
  _imagePadding //:number
  _textPadding  //:number
  _normalImage  //:string
  _hoverImage   //:string
  _activeImage  //:string
  normalColor   //:string
  hoverColor    //:string
  activeColor   //:string
  _imageOpacity //:number
  imageEffect   //:string
  normalTint    //:array
  hoverTint     //:array
  activeTint    //:array

  // 基础按钮脚本
  static BasicButtonScript = class BasicButtonScript {
    button
    hover = false
    active = false

    // 脚本添加事件
    onScriptAdd(button) {
      this.button = button
    }

    // 更新按钮状态
    updateButtonState(hoverSE = false) {
      if (this.active) {
        return this.button.activate()
      }
      if (this.hover) {
        return this.button.hover(hoverSE)
      }
      return this.button.restore()
    }

    // 鼠标移动事件
    onMouseMove() {
      if (!this.hover && !this.button.isProtected()) {
        this.hover = true
        UI.restoreRelatedButtons(this.button)
        this.updateButtonState(true)
      }
    }

    // 鼠标离开事件
    onMouseLeave() {
      this.hover = false
      // 当指针事件根元素包含按钮时，更新按钮状态
      if (!this.button.isProtected() &&
        UI.getPointerEventRoot().contains(this.button)) {
        this.updateButtonState()
      }
    }

    // 鼠标左键按下事件
    onMouseDownLB() {
      if (!this.button.isProtected() &&
        Input.event instanceof PointerEvent) {
        this.hover = true
        this.active = true
        UI.restoreRelatedButtons(this.button)
        this.updateButtonState()
        Input.on('mouseupLB', this.onMouseUpLB, true)
      }
    }

    // 鼠标左键弹起事件
    onMouseUpLB = () => {
      if (this.active) {
        this.active = false
        if (!this.button.isProtected()) {
          this.updateButtonState()
        }
      }
      Input.off('mouseupLB', this.onMouseUpLB)
    }

    // 鼠标点击事件
    onClick() {
      if (!this.button.isProtected()) {
        this.button.playClickSound()
      }
    }
  }

  constructor(data) {
    super(data)
    this._displayMode = 'normal'
    this.mode = 'normal'
    this.state = 'normal'
    this.selected = false
    this.shadowImage = this.createShadowImage(data)
    this.shadowText = this.createShadowText(data)
    this.shadowScript = this.createShadowScript()
    this.imageOpacity = data.imageOpacity
    this.imagePadding = data.imagePadding
    this.textPadding = data.textPadding
    this.normalImage = data.normalImage
    this.normalClip = [...data.normalClip]
    this.hoverImage = data.hoverImage
    this.hoverClip = [...data.hoverClip]
    this.activeImage = data.activeImage
    this.activeClip = [...data.activeClip]
    this.normalColor = data.normalColor
    this.hoverColor = data.hoverColor
    this.activeColor = data.activeColor
    this.imageEffect = data.imageEffect
    this.normalTint = [...data.normalTint]
    this.hoverTint = [...data.hoverTint]
    this.activeTint = [...data.activeTint]
    this.hoverSound = data.hoverSound
    this.clickSound = data.clickSound
    this.clip = this.normalClip
    this.tint = this.normalTint
    UI.latest = this
    this.emit('create')
  }

  // 读取模式
  get mode() {
    return this._mode
  }

  // 写入模式
  set mode(value) {
    if (this._mode !== value) {
      this._mode = value
      if (this.shadowImage) {
        this.updateDisplayMode()
      }
    }
  }

  // 读取图像内边距
  get imagePadding() {
    return this._imagePadding
  }

  // 写入图像内边距
  set imagePadding(value) {
    if (this._imagePadding !== value) {
      this._imagePadding = value
      this.shadowImage.transform.width = -value * 2
      this.shadowImage.transform.height = -value * 2
      if (this.connected) {
        this.shadowImage.resize()
      }
    }
  }

  // 读取文本内边距
  get textPadding() {
    return this._textPadding
  }

  // 写入文本内边距
  set textPadding(value) {
    if (this._textPadding !== value) {
      this._textPadding = value
      this.shadowText.transform.width = -value * 2
      this.shadowText.transform.height = -value * 2
      if (this.connected) {
        this.shadowText.resize()
      }
    }
  }

  // 读取图像
  get image() {
    return this.shadowImage.image
  }

  // 写入图像
  set image(value) {
    this.shadowImage.image = value
  }

  // 读取普通图像
  get normalImage() {
    return this._normalImage
  }

  // 写入普通图像
  set normalImage(value) {
    if (this._normalImage !== value) {
      this._normalImage = value
      if (this._displayMode === 'normal') {
        this.image = value
      }
    }
  }

  // 读取选中图像
  get hoverImage() {
    return this._hoverImage
  }

  // 写入普通图像
  set hoverImage(value) {
    if (this._hoverImage !== value) {
      this._hoverImage = value
      if (this._displayMode === 'hover') {
        this.image = value
      }
    }
  }

  // 读取按下图像
  get activeImage() {
    return this._activeImage
  }

  // 写入按下图像
  set activeImage(value) {
    if (this._activeImage !== value) {
      this._activeImage = value
      if (this._displayMode === 'active') {
        this.image = value
      }
    }
  }

  // 读取显示模式
  get display() {
    return this.shadowImage.display
  }

  // 写入显示模式
  set display(value) {
    this.shadowImage.display = value
  }

  // 读取翻转模式
  get flip() {
    return this.shadowImage.flip
  }

  // 写入翻转模式
  set flip(value) {
    this.shadowImage.flip = value
  }

  // 读取裁剪区域
  get clip() {
    return this.shadowImage.clip
  }

  // 写入裁剪区域
  set clip(value) {
    this.shadowImage.clip = value
  }

  // 读取图像色调
  get tint() {
    return this.shadowImage.tint
  }

  // 写入图像色调
  set tint(value) {
    this.shadowImage.tint = value
  }

  // 读取图像切片边距
  get border() {
    return this.shadowImage.border
  }

  // 写入图像切片边距
  set border(value) {
    this.shadowImage.border = value
  }

  // 读取图像不透明度
  get imageOpacity() {
    return this._imageOpacity
  }

  // 写入图像不透明度
  set imageOpacity(value) {
    if (this._imageOpacity !== value) {
      this._imageOpacity = value
      this.shadowImage.transform.opacity = value
      if (this.connected) {
        this.shadowImage.resize()
      }
    }
  }

  // 读取文本内容
  get content() {
    return this.shadowText.content
  }

  // 写入文本内容
  set content(value) {
    this.shadowText.content = value
  }

  // 读取字体大小
  get size() {
    return this.shadowText.size
  }

  // 写入字体大小
  set size(value) {
    this.shadowText.size = value
  }

  // 读取字体
  get font() {
    return this.shadowText.font
  }

  // 写入字体
  set font(value) {
    this.shadowText.font = value
  }

  // 读取方向
  get direction() {
    return this.shadowText.direction
  }

  // 写入方向
  set direction(value) {
    this.shadowText.direction = value
  }

  // 读取水平对齐
  get horizontalAlign() {
    return this.shadowText.horizontalAlign
  }

  // 写入水平对齐
  set horizontalAlign(value) {
    this.shadowText.horizontalAlign = value
  }

  // 读取垂直对齐
  get verticalAlign() {
    return this.shadowText.verticalAlign
  }

  // 写入垂直对齐
  set verticalAlign(value) {
    this.shadowText.verticalAlign = value
  }

  // 读取字体大小
  get size() {
    return this.shadowText.size
  }

  // 写入字体大小
  set size(value) {
    this.shadowText.size = value
  }

  // 读取行间距
  get lineSpacing() {
    return this.shadowText.lineSpacing
  }

  // 写入行间距
  set lineSpacing(value) {
    this.shadowText.lineSpacing = value
  }

  // 读取字间距
  get letterSpacing() {
    return this.shadowText.letterSpacing
  }

  // 写入字间距
  set letterSpacing(value) {
    this.shadowText.letterSpacing = value
  }

  // 读取颜色
  get color() {
    return this.shadowText.color
  }

  // 写入颜色
  set color(value) {
    this.shadowText.color = value
  }

  // 读取字体
  get font() {
    return this.shadowText.font
  }

  // 写入字体
  set font(value) {
    this.shadowText.font = value
  }

  // 读取字型
  get typeface() {
    return this.shadowText.typeface
  }

  // 写入字型
  set typeface(value) {
    this.shadowText.typeface = value
  }

  // 读取文字效果
  get textEffect() {
    return this.shadowText.effect
  }

  // 写入文字效果
  set textEffect(value) {
    this.shadowText.effect = value
  }

  // 影子变换对象
  static shadowTransform = {
    anchorX: 0.5,
    anchorY: 0.5,
    x: 0,
    x2: 0.5,
    y: 0,
    y2: 0.5,
    width: 0,
    width2: 1,
    height: 0,
    height2: 1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    opacity: 1,
  }

  // 图像元素数据
  static imageData = {
    ...ImageElement.defaultData,
    transform: this.shadowTransform,
  }

  // 文本元素数据
  static textData = {
    ...TextElement.defaultData,
    transform: this.shadowTransform,
  }

  // 创建影子图像元素
  createShadowImage(data) {
    const {imageData} = ButtonElement
    imageData.image = data.normalImage
    imageData.display = data.display
    imageData.flip = data.flip
    imageData.clip = data.normalClip
    imageData.tint = data.normalTint
    imageData.border = data.border
    const element = new ImageElement(imageData)
    element.parent = this
    element.connected = true
    this.updaters.add(element.updaters)
    return element
  }

  // 创建影子文本元素
  createShadowText(data) {
    const {textData} = ButtonElement
    textData.color = data.normalColor
    textData.direction = data.direction
    textData.horizontalAlign = data.horizontalAlign
    textData.verticalAlign = data.verticalAlign
    textData.content = data.content
    textData.size = data.size
    textData.letterSpacing = data.letterSpacing
    textData.font = data.font
    textData.typeface = data.typeface
    textData.effect = data.textEffect
    const element = new TextElement(textData)
    element.parent = this
    element.connected = true
    this.updaters.add(element.updaters)
    return element
  }

  // 创建影子脚本
  createShadowScript() {
    const script = Script.create(this, [])
    script.add(new ButtonElement.BasicButtonScript())
    return script
  }

  // 判断按钮是否处于受保护的状态
  isProtected() {
    const focuses = UI.focuses
    const length = focuses.length
    const focus = focuses[length - 1]
    if (focus instanceof UIElement) {
      if (focus.focusMode === 'control-descendant-buttons'
      ? focus.contains(this)
      : focus === this.parent) {
        return false
      }
    }
    for (let i = length - 2; i >= 0; i--) {
      const focus = focuses[i]
      if (focus.focusMode === 'control-descendant-buttons'
      ? focus.contains(this)
      : focus === this.parent) {
        return true
      }
    }
    return false
  }

  // 播放鼠标悬停音效
  playHoverSound() {
    AudioManager.se.play(this.hoverSound)
  }

  // 播放鼠标点击音效
  playClickSound() {
    AudioManager.se.play(this.clickSound)
  }

  // 更新文本内容
  updateTextContent() {
    this.shadowText.updateTextContent()
  }

  // 更新打印机
  updatePrinter() {
    this.shadowText.updatePrinter()
  }

  // 更新显示模式
  updateDisplayMode(se = false) {
    let mode = this.mode
    if (mode === 'normal') {
      mode = this.state
      if (mode === 'hover' && this.isProtected()) {
        mode = 'active'
      }
    }
    if (this._displayMode !== mode) {
      this._displayMode = mode
      switch (mode) {
        case 'normal':
          this.image = this.normalImage
          this.color = this.normalColor
          this.clip = this.normalClip
          switch (this.imageEffect) {
            case 'none':
              break
            case 'tint-1':
            case 'tint-2':
            case 'tint-3':
              this.tint = this.normalTint
              break
          }
          break
        case 'hover':
          this.image = this.hoverImage || this.normalImage
          this.color = this.hoverColor || this.normalColor
          this.clip = this.hoverImage && this.hoverClip || this.normalClip
          switch (this.imageEffect) {
            case 'none':
              break
            case 'tint-1':
              this.tint = this.normalTint
              break
            case 'tint-2':
            case 'tint-3':
              this.tint = this.hoverTint
              break
          }
          if (se) {
            this.playHoverSound()
          }
          break
        case 'active':
          this.image = this.activeImage || this.hoverImage || this.normalImage
          this.color = this.activeColor || this.hoverColor || this.normalColor
          this.clip = this.activeImage && this.activeClip || this.hoverImage && this.hoverClip || this.normalClip
          switch (this.imageEffect) {
            case 'none':
              break
            case 'tint-1':
              this.tint = this.normalTint
              break
            case 'tint-2':
              this.tint = this.hoverTint
              break
            case 'tint-3':
              this.tint = this.activeTint
              break
          }
          break
      }
    }
  }

  // 恢复正常状态
  restore() {
    if (this.state !== 'normal') {
      if (this.selected) {
        this.selected = false
        this.emit('deselect')
      }
      this.state = 'normal'
      this.updateDisplayMode()
    }
  }

  // 进入鼠标悬停状态
  hover(se = false) {
    if (this.state !== 'hover') {
      if (!this.selected) {
        this.selected = true
        this.emit('select')
      }
      this.state = 'hover'
      this.updateDisplayMode(se)
      if (!(Input.event instanceof PointerEvent) &&
        this.parent instanceof WindowElement) {
        this.parent.scrollToChild(this)
      }
    }
  }

  // 进入鼠标按下状态
  activate() {
    if (this.state !== 'active') {
      if (!this.selected) {
        this.selected = true
        this.emit('select')
      }
      this.state = 'active'
      this.updateDisplayMode()
    }
  }

  // 绘制图像
  draw() {
    if (this.visible === false) {
      return this.drawChildren()
    }

    // 绘制图像
    this.shadowImage.draw()

    // 绘制文本
    this.shadowText.draw()

    // 绘制子元素
    this.drawChildren()
  }

  // 调整大小
  resize() {
    if (this.parent instanceof WindowElement) {
      return this.parent.requestResizing()
    }
    this.calculatePosition()
    this.shadowImage.resize()
    this.shadowText.resize()
    this.resizeChildren()
  }

  /**
   * 调用元素事件和脚本
   * @param {string} type 元素事件类型
   * @param {boolean} [bubble] 是否传递事件
   */
  emit(type, bubble = false) {
    // 调用影子脚本方法
    this.shadowScript.emit(type, this)
    // 当按钮处于受保护状态时，忽略部分事件
    switch (type) {
      case 'mousemove':
      case 'mouseenter':
      case 'mouseleave':
      case 'mousedown':
      case 'mousedownLB':
      case 'mousedownRB':
      case 'mouseup':
      case 'mouseupLB':
      case 'mouseupRB':
      case 'click':
        if (this.isProtected()) return
        Input.bubbles.stop()
    }
    return super.emit(type, bubble)
  }

  // 销毁元素
  destroy() {
    this.shadowImage.destroy()
    this.shadowText.destroy()
    return super.destroy()
  }
}

// ******************************** 动画元素 ********************************

class AnimationElement extends UIElement {
  player        //:object
  _animation    //:string
  _motion       //:string
  _rotatable    //:boolean
  _angle        //:number
  initialFrame  //:number
  _offsetX      //:number
  _offsetY      //:number
  animationX    //:number
  animationY    //:number

  // 动画矩阵
  static matrix = new Matrix()

  constructor(data) {
    super(data)
    this.player = null
    this.motion = Enum.getValue(data.motion)
    this.autoplay = data.autoplay
    this.rotatable = data.rotatable
    this.angle = data.angle
    this.initialFrame = data.frame
    this.offsetX = data.offsetX
    this.offsetY = data.offsetY
    this.animation = data.animation
    this.emit('create')
  }

  // 读取动画ID
  get animation() {
    return this._animation
  }

  // 写入动画ID
  set animation(value) {
    if (this._animation !== value) {
      this._animation = value
      if (this.player !== null) {
        this.player.destroy()
        this.player = null
      }
      const animation = Data.animations[value]
      if (animation !== undefined) {
        this.player = new Animation(animation)
        this.player.paused = !this.autoplay
        this.player.setAsUIComponent()
        this.player.setMotion(this.motion)
        this.player.rotatable = this.rotatable
        this.player.setAngle(Math.radians(this.angle))
        this.player.goto(this.initialFrame)
        this.player.end = () => {
          // 渲染时触发的结束事件
          // 因此推迟到下一帧执行
          Callback.push(() => {
            this.emit('ended', false)
          })
        }
      }
    }
  }

  // 读取动作
  get motion() {
    return this._motion
  }

  // 写入动作
  set motion(value) {
    if (this._motion !== value) {
      this._motion = value
      this.player?.setMotion(value)
    }
  }

  // 读取可旋转开关
  get rotatable() {
    return this._rotatable
  }

  // 写入可旋转开关
  set rotatable(value) {
    if (this._rotatable !== value) {
      this._rotatable = value
      if (this.player) {
        this.player.rotatable = value
        this.player.rotation = 0
        if (typeof this.angle === 'number') {
          this.player.setAngle(Math.radians(this.angle))
        }
      }
    }
  }

  // 读取角度
  get angle() {
    return this._angle
  }

  // 写入角度
  set angle(value) {
    if (this._angle !== value) {
      this._angle = value
      this.player?.setAngle(Math.radians(value))
    }
  }

  // 读取帧
  get frame() {
    return this.player?.index
  }

  // 写入帧
  set frame(value) {
    this.player?.goto(value)
  }

  // 读取偏移X
  get offsetX() {
    return this._offsetX
  }

  // 写入偏移X
  set offsetX(value) {
    if (this._offsetX !== value) {
      this._offsetX = value
      if (this.connected) {
        this.calculateAnimationPosition()
      }
    }
  }

  // 读取偏移Y
  get offsetY() {
    return this._offsetY
  }

  // 写入偏移Y
  set offsetY(value) {
    if (this._offsetY !== value) {
      this._offsetY = value
      if (this.connected) {
        this.calculateAnimationPosition()
      }
    }
  }

  /**
   * 加载角色动画
   * @param {Actor} actor 角色
   */
  loadActorAnimation(actor) {
    const {animation} = actor
    if (animation instanceof Animation) {
      this.animation = ''
      this.animation = animation.data.id
      this.player.images = animation.images
    }
  }

  // 绘制图像
  draw() {
    const player = this.player
    if (player !== null) {
      player.update(Time.rawDeltaTime)
      GL.alpha = this.opacity
      const gl = GL
      const program = gl.spriteProgram.use()
      const matrix = AnimationElement.matrix.project(
        gl.flip,
        gl.width,
        gl.height,
      ).multiply(this.matrix)
      gl.batchRenderer.bindProgram()
      gl.batchRenderer.setAttrSize(8)
      gl.bindVertexArray(program.vao)
      gl.uniformMatrix3fv(program.u_Matrix, false, matrix)
      const ax = this.animationX
      const ay = this.animationY
      player.position.x = ax
      player.position.y = ay
      player.setDrawingPosition(ax, ay)
      player.updateFrameParameters()
      player.draw('raw')
      gl.batchRenderer.draw()
      gl.batchRenderer.unbindProgram()
      player.emitters.update(Time.rawDeltaTime)
      player.emitters.draw(matrix)
    }

    // 绘制子元素
    this.drawChildren()
  }

  // 调整大小
  resize() {
    if (this.parent instanceof WindowElement) {
      return this.parent.requestResizing()
    }
    this.calculatePosition()
    this.calculateAnimationPosition()
    this.resizeChildren()
  }

  // 计算动画位置
  calculateAnimationPosition() {
    this.animationX = this.x + this.width / 2 + this.offsetX
    this.animationY = this.y + this.height / 2 + this.offsetY
  }

  // 销毁元素
  destroy() {
    this.player?.destroy()
    return super.destroy()
  }
}

// ******************************** 视频元素 ********************************

class VideoElement extends UIElement {
  /** HTML视频元素(影子元素)
   *  @type {HTMLVideoElement}
   */ player

  /** 视频元素当前播放状态
   *  @type {string}
   */ state

  /** 视频元素翻转模式
   *  @type {string}
   */ flip

  /** 混合模式
   *  @type {string}
   */ blend

  /** 视频元素纹理
   *  @type {Texture}
   */ texture

  // 私有属性
  _onSwitch //:function

  // 默认视频元素数据
  static defaultData = {
    video: '',
    playbackRate: 1,
    loop: false,
    flip: 'none',
    blend: 'normal',
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 视频元素数据
   */
  constructor(data = VideoElement.defaultData) {
    super(data)
    // 创建影子视频元素
    this.player = document.createElement('video')
    this.state = 'paused'
    this.playbackRate = data.playbackRate
    this.video = data.video
    this.loop = data.loop
    this.flip = data.flip
    this.blend = data.blend
    this.texture = new Texture()
    this.texture.complete = false
    // 视频播放状态侦听器
    this.player.on('play', () => {this.state = 'playing'})
    this.player.on('pause', () => {this.state = 'paused'})
    this.player.on('ended', () => {
      this.state = 'ended'
      this.emit('ended', false)
    })
    // 视频播放错误时暂停
    this.player.on('error', () => {this.player.pause()})
    // 页面不可见时暂停播放
    this._onSwitch = () => {
      if (document.hidden) {
        if (this.state === 'playing') {
          this.player.pause()
        }
      } else {
        if (this.state === 'paused') {
          this.player.play().catch(error => {})
        }
      }
    }
    // 创建视频帧更新器
    this.createVideoFrameUpdater()
    this.emit('create')
  }

  /**
   * 视频文件ID
   * @type {string}
   */
  get video() {
    return this.player.guid
  }

  set video(value) {
    const {player} = this
    if (player.guid !== value) {
      player.guid = value
      player.src = File.getPathByGUID(value)
      // 重新加载视频将会重置播放速度
      player.playbackRate = this.playbackRate
      player.play().catch(error => {
        this.texture.complete = false
        this.texture.resize(0, 0)
      })
    }
  }

  /** 视频播放速度 */
  get playbackRate() {
    return this._playbackRate
  }

  set playbackRate(value) {
    this._playbackRate = value
    this.player.playbackRate = value
  }

  /** 视频循环播放开关 */
  get loop() {
    return this.player.loop
  }

  set loop(value) {
    this.player.loop = value
  }

  /** 创建视频帧更新器 */
  createVideoFrameUpdater() {
    const {player, texture} = this
    if ('requestVideoFrameCallback' in player) {
      // 优先使用请求视频帧回调的方法
      const update = () => {
        if (texture.destroyed) return
        if (!texture.complete) {
          texture.complete = true
        }
        if (texture.width !== player.videoWidth || texture.height !== player.videoHeight) {
          texture.resize(player.videoWidth, player.videoHeight)
        }
        GL.bindTexture(GL.TEXTURE_2D, texture.base.glTexture)
        GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, player)
        player.requestVideoFrameCallback(update)
      }
      player.requestVideoFrameCallback(update)
    } else {
      // 兼容模式：添加更新器
      const fps = 60
      const interval = 1000 / fps
      let elapsed = 0
      this.updaters.add({
        update: () => {
          elapsed += Time.rawDeltaTime
          if (elapsed >= interval) {
            elapsed %= interval
            // 当视频已加载时，上传视频画面到纹理
            if (player.readyState === 4) {
              if (texture.destroyed) return
              if (!texture.complete) {
                texture.complete = true
              }
              if (texture.width !== player.videoWidth || texture.height !== player.videoHeight) {
                texture.resize(player.videoWidth, player.videoHeight)
              }
              GL.bindTexture(GL.TEXTURE_2D, texture.base.glTexture)
              GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, player)
            }
          }
        }
      })
    }
  }

  /** 暂停播放视频 */
  pause() {
    if (this.state === 'playing') {
      this.player.pause()
    }
  }

  /** 继续播放视频 */
  continue() {
    if (this.state === 'paused') {
      this.player.play().catch(error => {})
    }
  }

  /** 连接视频元素 */
  connect() {
    super.connect()
    this.player.play().catch(error => {})
    document.on('visibilitychange', this._onSwitch)
  }

  /** 断开视频元素 */
  disconnect() {
    super.disconnect()
    this.player.pause()
    document.off('visibilitychange', this._onSwitch)
  }

  /** 绘制视频元素 */
  draw() {
    if (this.visible === false) {
      return
    }
    const {texture} = this
    if (texture.complete) {
      let dx = this.x
      let dy = this.y
      let dw = this.width
      let dh = this.height
      // 视频翻转模式
      switch (this.flip) {
        case 'none':
          break
        case 'horizontal':
          dx += dw
          dw *= -1
          break
        case 'vertical':
          dy += dh
          dh *= -1
          break
        case 'both':
          dx += dw
          dy += dh
          dw *= -1
          dh *= -1
          break
      }
      GL.alpha = this.opacity
      GL.blend = this.blend
      GL.matrix.set(this.matrix)
      GL.drawImage(texture, dx, dy, dw, dh)
    }
    this.drawChildren()
  }

  /** 重新调整视频元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      this.resizeChildren()
    }
  }

  /** 设置视频播放结束回调 */
  onEnded(callback) {
    if (this.state === 'ended') return callback()
    this.player.on('ended', callback, {once: true})
  }

  /** 销毁视频元素 */
  destroy() {
    this.player.pause()
    this.texture?.destroy()
    // 如果当前状态不是已结束，发送模拟事件
    if (this.state !== 'ended') {
      this.player.dispatchEvent(
        new window.Event('ended')
      )
    }
    return super.destroy()
  }
}

// ******************************** 窗口元素 ********************************

class WindowElement extends UIElement {
  /** 窗口滚动区域宽度
   *  @type {number}
   */ scrollWidth

  /** 窗口滚动区域高度
   *  @type {number}
   */ scrollHeight

  /** 窗口内容溢出处理模式(可见|隐藏)
   *  @type {string}
   */ overflow

  /** 窗口网格列数
   *  @type {number}
   */ columns

  /** 窗口网格行数
   *  @type {number}
   */ rows

  /** 代理元素
   *  @type {Object}
   */ proxy

  // 私有属性
  _layout       //:string
  _scrollX      //:number
  _scrollY      //:number

  // 默认窗口元素数据
  static defaultData = {
    layout: 'normal',
    scrollX: 0,
    scrollY: 0,
    gridWidth: 0,
    gridHeight: 0,
    gridGapX: 0,
    gridGapY: 0,
    paddingX: 0,
    paddingY: 0,
    overflow: 'visible',
    ...UIElement.defaultData,
  }

  /**
   * @param {Object} data 窗口元素数据
   */
  constructor(data = WindowElement.defaultData) {
    super(data)
    this.layout = data.layout
    this.scrollWidth = 0
    this.scrollHeight = 0
    this.scrollX = data.scrollX
    this.scrollY = data.scrollY
    this.gridWidth = data.gridWidth
    this.gridHeight = data.gridHeight
    this.gridGapX = data.gridGapX
    this.gridGapY = data.gridGapY
    this.paddingX = data.paddingX
    this.paddingY = data.paddingY
    this.overflow = data.overflow
    this.columns = 0
    this.rows = 0
    this.proxy = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      matrix: null,
      opacity: 0,
    }
    this.emit('create')
  }

  /**
   * 窗口布局
   * @type {string}
   */
  get layout() {
    return this._layout
  }

  set layout(value) {
    if (this._layout !== value) {
      this._layout = value
      // 针对不同的布局模式，设置特定的方法
      switch (value) {
        case 'normal':
          delete this.resize
          break
        case 'horizontal-grid':
          this.resize = WindowElement.horizontalGridResize
          break
        case 'vertical-grid':
          this.resize = WindowElement.verticalGridResize
          break
      }
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口滚动X
   * @type {number}
   */
  get scrollX() {
    return this._scrollX
  }

  set scrollX(value) {
    const max = this.scrollWidth - this.width
    const scrollX = Math.clamp(value, 0, max)
    if (this._scrollX !== scrollX && Number.isFinite(value)) {
      this._scrollX = scrollX
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口滚动Y
   * @type {number}
   */
  get scrollY() {
    return this._scrollY
  }

  set scrollY(value) {
    const max = this.scrollHeight - this.height
    const scrollY = Math.clamp(value, 0, max)
    if (this._scrollY !== scrollY && Number.isFinite(value)) {
      this._scrollY = scrollY
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口网格宽度
   * @type {number}
   */
  get gridWidth() {
    return this._gridWidth
  }

  set gridWidth(value) {
    if (this._gridWidth !== value) {
      this._gridWidth = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口网格高度
   * @type {number}
   */
  get gridHeight() {
    return this._gridHeight
  }

  set gridHeight(value) {
    if (this._gridHeight !== value) {
      this._gridHeight = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口网格水平间距
   * @type {number}
   */
  get gridGapX() {
    return this._gridGapX
  }

  set gridGapX(value) {
    if (this._gridGapX !== value) {
      this._gridGapX = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口网格垂直间距
   * @type {number}
   */
  get gridGapY() {
    return this._gridGapY
  }

  set gridGapY(value) {
    if (this._gridGapY !== value) {
      this._gridGapY = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口水平内边距
   * @type {number}
   */
  get paddingX() {
    return this._paddingX
  }

  set paddingX(value) {
    if (this._paddingX !== value) {
      this._paddingX = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 窗口垂直内边距
   * @type {number}
   */
  get paddingY() {
    return this._paddingY
  }

  set paddingY(value) {
    if (this._paddingY !== value) {
      this._paddingY = value
      if (this.connected) {
        this.resize()
      }
    }
  }

  /**
   * 获取窗口内部可见的网格列数
   * @returns {number} 列数
   */
  getVisibleGridColumns() {
    switch (this.layout) {
      case 'normal':
        return 0
    }
    const innerWidth = this.width + this.gridGapX - this.paddingX * 2
    const unitWidth = this.gridWidth + this.gridGapX
    return unitWidth > 0 ? Math.floor(innerWidth / unitWidth) : Infinity
  }

  /**
   * 获取窗口内部可见的网格行数
   * @returns {number} 行数
   */
  getVisibleGridRows() {
    switch (this.layout) {
      case 'normal':
        return 0
    }
    const innerHeight = this.height + this.gridGapY - this.paddingY * 2
    const unitHeight = this.gridHeight + this.gridGapY
    return unitHeight > 0 ? Math.floor(innerHeight / unitHeight) : Infinity
  }

  /**
   * 滚动到子元素
   * @param {UIElement} element 子元素
   */
  scrollToChild(element) {
    const index = this.children.indexOf(element)
    if (index !== -1) {
      switch (this.layout) {
        case 'normal': {
          const left = element.x - this.x
          const top = element.y - this.y
          const right = left + element.width
          const bottom = top + element.height
          this.scrollX = Math.clamp(this.scrollX, right - this.width, left)
          this.scrollY = Math.clamp(this.scrollY, bottom - this.height, top)
          break
        }
        case 'horizontal-grid': {
          const cols = this.getVisibleGridColumns()
          if (Number.isFinite(cols)) {
            const rows = Math.floor(index / cols)
            const y = rows * (this.gridHeight + this.gridGapY) + this.paddingY
            this.scrollY = Math.clamp(this.scrollY, y + this.gridHeight - this.height, y)
          }
          break
        }
        case 'vertical-grid': {
          const rows = this.getVisibleGridRows()
          if (Number.isFinite(rows)) {
            const cols = Math.floor(index / rows)
            const x = cols * (this.gridWidth + this.gridGapX) + this.paddingX
            this.scrollX = Math.clamp(this.scrollX, x + this.gridWidth - this.width, x)
          }
          break
        }
      }
    }
  }

  /** 绘制窗口元素 */
  draw() {
    if (this.visible === false) {
      return
    }

    // 绘制子元素
    switch (this.overflow) {
      case 'visible':
        this.drawChildren()
        break
      case 'hidden':
        if (!GL.depthTest) {
          GL.alpha = 1
          GL.blend = 'normal'
          GL.depthTest = true
          GL.enable(GL.DEPTH_TEST)
          GL.depthFunc(GL.ALWAYS)
          GL.matrix.set(this.matrix)
          GL.fillRect(this.x, this.y, this.width, this.height, 0x00000000)
          GL.depthFunc(GL.EQUAL)
          this.drawChildren()
          GL.clear(GL.DEPTH_BUFFER_BIT)
          GL.disable(GL.DEPTH_TEST)
          GL.depthTest = false
        }
        break
    }
  }

  /** 绘制所有子元素 */
  drawChildren() {
    if (this.overflow === 'visible') {
      return super.drawChildren()
    }
    switch (this.layout) {
      case 'normal':
        return super.drawChildren()
      case 'horizontal-grid': {
        const unitWidth = this.gridWidth + this.gridGapX
        const unitHeight = this.gridHeight + this.gridGapY
        if (unitWidth * unitHeight === 0) {
          return super.drawChildren()
        }
        const children = this.children
        const scrollTop = this.scrollY - this.paddingY
        const scrollBottom = scrollTop + this.height
        const startRow = Math.floor(scrollTop / unitHeight)
        const endRow = Math.ceil(scrollBottom / unitHeight)
        const start = Math.max(startRow * this.columns, 0)
        const end = Math.min(endRow * this.columns, children.length)
        for (let i = start; i < end; i++) {
          children[i].draw()
        }
        break
      }
      case 'vertical-grid': {
        const unitWidth = this.gridWidth + this.gridGapX
        const unitHeight = this.gridHeight + this.gridGapY
        if (unitWidth * unitHeight === 0) {
          return super.drawChildren()
        }
        const children = this.children
        const scrollLeft = this.scrollX - this.paddingX
        const scrollRight = scrollLeft + this.width
        const startCol = Math.floor(scrollLeft / unitWidth)
        const endCol = Math.ceil(scrollRight / unitWidth)
        const start = Math.max(startCol * this.rows, 0)
        const end = Math.min(endCol * this.rows, children.length)
        for (let i = start; i < end; i++) {
          children[i].draw()
        }
        break
      }
    }
  }

  /** 重新调整窗口元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      const {proxy} = this
      const {children} = this
      const {length} = children
      // 通过代理元素模拟出滚动区域的位置
      proxy.x = this.x - this.scrollX
      proxy.y = this.y - this.scrollY
      proxy.width = this.width
      proxy.height = this.height
      proxy.matrix = this.matrix
      proxy.opacity = this.opacity
      for (let i = 0; i < length; i++) {
        // 暂时设置子元素的父元素为代理元素，然后计算位置
        const element = children[i]
        element.parent = proxy
        element.resize()
        element.parent = this
      }
      // 正常布局下，需要计算滚动区域
      this._calculateScrollArea()
    }
  }

  /** 请求调整窗口元素(过滤重复请求) */
  requestResizing() {
    // 忽略同一帧内的重复请求
    if (!this.requesting) {
      this.requesting = true
      Callback.push(() => {
        delete this.requesting
        this.resize()
      })
    }
  }

  /** 计算窗口滚动区域 */
  _calculateScrollArea() {
    const {max} = Math
    const {children} = this
    const {length} = children
    const parentWidth = this.width
    const parentHeight = this.height
    // 设置滚动区域的最小值
    let scrollWidth = this.width
    let scrollHeight = this.height
    for (let i = 0; i < length; i++) {
      // 根据子元素的变换参数估算滚动区域大小
      const {transform} = children[i]
      const sx = transform.scaleX
      const sy = transform.scaleY
      // 计算绝对位置
      const x = transform.x + transform.x2 * parentWidth
      const y = transform.y + transform.y2 * parentHeight
      // 计算绝对宽高
      const w = max(transform.width + transform.width2 * parentWidth, 0)
      const h = max(transform.height + transform.height2 * parentHeight, 0)
      scrollWidth = max(scrollWidth, x + (1 - transform.anchorX) * w * sx)
      scrollHeight = max(scrollHeight, y + (1 - transform.anchorY) * h * sy)
    }
    this.scrollWidth = scrollWidth
    this.scrollHeight = scrollHeight
    // 如果滚动区域发生变化，调整滚动位置
    this.scrollX = this.scrollX
    this.scrollY = this.scrollY
  }

  /** 水平网格 - 重新调整窗口元素 */
  static horizontalGridResize() {
    if (!this.visible) return
    this.calculatePosition()
    const {children} = this
    const {length} = children
    // 如果不存在子元素，返回
    if (length === 0) {
      this.columns = 0
      this.rows = 0
      return
    }
    const {proxy} = this
    const {floor, ceil, max} = Math
    const {gridWidth, gridHeight, gridGapX, gridGapY, paddingX, paddingY} = this
    const unitWidth = gridWidth + gridGapX
    const unitHeight = gridHeight + gridGapY
    // 如果单元宽度是0，全部子元素放在同一行，否则计算行数和列数
    const columns = unitWidth === 0 ? length
    : max(floor((this.width + gridGapX - paddingX * 2) / unitWidth), 1)
    const rows = ceil(length / columns)
    // 计算滚动区域大小
    const scrollHeight = rows * unitHeight - gridGapY + paddingY * 2
    this.scrollWidth = max(this.width, gridWidth)
    this.scrollHeight = max(this.height, scrollHeight)
    this.columns = columns
    this.rows = rows
    // 如果滚动区域发生变化，调整滚动位置
    this.scrollY = this.scrollY
    // 设置网格代理元素的大小和矩阵
    proxy.width = gridWidth
    proxy.height = gridHeight
    proxy.matrix = this.matrix
    proxy.opacity = this.opacity
    // 设置网格代理元素开始位置
    const sx = this.x - this.scrollX + paddingX
    const sy = this.y - this.scrollY + paddingY
    for (let i = 0; i < length; i++) {
      const element = children[i]
      // 计算网格代理元素的具体位置
      proxy.x = sx + i % columns * unitWidth
      proxy.y = sy + floor(i / columns) * unitHeight
      // 暂时设置子元素的父元素为代理元素，然后计算位置
      element.parent = proxy
      element.resize()
      element.parent = this
    }
  }

  /** 垂直网格 - 重新调整窗口元素 */
  static verticalGridResize() {
    if (!this.visible) return
    this.calculatePosition()
    const {children} = this
    const {length} = children
    // 如果不存在子元素，返回
    if (length === 0) {
      this.columns = 0
      this.rows = 0
      return
    }
    const {proxy} = this
    const {floor, ceil, max} = Math
    const {gridWidth, gridHeight, gridGapX, gridGapY, paddingX, paddingY} = this
    const unitWidth = gridWidth + gridGapX
    const unitHeight = gridHeight + gridGapY
    // 如果单元高度是0，全部子元素放在同一列，否则计算行数和列数
    const rows = unitHeight === 0 ? length
    : max(floor((this.height + gridGapY - paddingY * 2) / unitHeight), 1)
    const columns = ceil(length / rows)
    // 计算滚动区域大小
    const scrollWidth = columns * unitWidth - gridGapX + paddingX * 2
    this.scrollWidth = max(this.width, scrollWidth)
    this.scrollHeight = max(this.height, gridHeight)
    this.columns = columns
    this.rows = rows
    // 如果滚动区域发生变化，调整滚动位置
    this.scrollX = this.scrollX
    // 设置网格代理元素的大小和矩阵
    proxy.width = gridWidth
    proxy.height = gridHeight
    proxy.matrix = this.matrix
    proxy.opacity = this.opacity
    // 设置网格代理元素开始位置
    const sx = this.x - this.scrollX + paddingX
    const sy = this.y - this.scrollY + paddingY
    for (let i = 0; i < length; i++) {
      const element = children[i]
      // 计算网格代理元素的具体位置
      proxy.x = sx + floor(i / rows) * unitWidth
      proxy.y = sy + i % rows * unitHeight
      // 暂时设置子元素的父元素为代理元素，然后计算位置
      element.parent = proxy
      element.resize()
      element.parent = this
    }
  }
}

// ******************************** 容器元素 ********************************

class ContainerElement extends UIElement {
  constructor(data = UIElement.defaultData) {
    super(data)
    this.emit('create')
  }

  /** 绘制容器元素 */
  draw() {
    if (this.visible) {
      this.drawChildren()
    }
  }

  /** 重新调整容器元素 */
  resize() {
    if (this.visible) {
      if (this.parent instanceof WindowElement) {
        return this.parent.requestResizing()
      }
      this.calculatePosition()
      this.resizeChildren()
    }
  }
}

// ******************************** 元素管理器 ********************************

const UIElementManager = new class {
  // 给元素注入的分区键
  CELL = Symbol('CELL')
  cells = [[], [], [], []]
  counts = new Uint32Array(4)
  index = 0

  // 激活的元素列表
  activeElements = []
  activeCount = 0

  // 读取元素数量
  get count() {
    let count = 0
    for (const cell of this.cells) {
      count += cell.length
    }
    return count
  }

  /**
   * 添加元素到管理器中
   * @param {UIElement} element 元素实例
   */
  append(element) {
    const cells = this.cells
    const index = this.index++ % cells.length
    const cell = cells[index]
    if (!element[this.CELL]) {
      element[this.CELL] = cell
    }
    if (!element.activated) {
      element.activated = true
      this.activate(element)
    }
    cell.push(element)
  }

  /**
   * 从管理器中移除元素
   * @param {UIElement} element 元素实例
   */
  remove(element) {
    // 延迟从分区中移除
    const cell = element[this.CELL]
    delete element[this.CELL]
    Callback.push(() => {
      cell.remove(element)
    })
  }

  /**
   * 准备激活第一次添加到管理器中的元素
   * @param {UIElement} element 元素实例
   */
  activate(element) {
    this.activeElements[this.activeCount++] = element
  }

  /** 调用自动执行事件 */
  autorun() {
    for (let i = 0; i < this.activeCount; i++) {
      this.activeElements[i].emit('autorun', false)
      this.activeElements[i] = null
    }
    this.activeCount = 0
  }

  /** 更新已连接的元素 */
  update() {
    // 发送激活元素的自动执行事件
    this.autorun()
    const cells = this.cells
    const counts = this.counts
    const length = cells.length
    // 先确定所有分区的长度
    // 因为在更新时可能加入新元素导致变长
    // 新加入的元素就留到下一帧进行更新
    for (let i = 0; i < length; i++) {
      counts[i] = cells[i].length
    }
    // 遍历所有分区中的元素
    const deltaTime = Time.rawDeltaTime
    for (let i = 0; i < length; i++) {
      const cell = cells[i]
      const count = counts[i]
      for (let i = 0; i < count; i++) {
        const element = cell[i]
        // 如果元素已连接，更新它的模块
        if (element.connected) {
          element.updaters.update(deltaTime)
        }
      }
    }
    // 再次发送激活元素的自动执行事件
    while (this.activeCount !== 0) {
      this.autorun()
    }
  }
}