'use strict'

// ******************************** 舞台对象 ********************************

const Stage = new class {
  resolution = {
    width: 0,
    height: 0,
  }

  /** 初始化舞台 */
  async initialize() {
    // 加载配置和全局数据文件
    await Promise.all([
      Data.loadConfig(),
      Data.loadGlobalData(),
    ])

    // 设置网页标题
    const title = document.createElement('title')
    title.textContent = Data.config.window.title
    document.head.appendChild(title)

    // 设置body样式
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'

    // 设置初始分辨率
    this.resolution.width = Data.globalData.canvasWidth
    this.resolution.height = Data.globalData.canvasHeight

    // 调整大小
    this.resize()

    // 侦听事件
    window.on('resize', this.resize)
  }

  /**
   * 设置分辨率
   * @param {number} width 分辨率宽度
   * @param {number} height 分辨率高度
   * @param {number} sceneScale 场景缩放系数
   * @param {number} uiScale 界面缩放系数
   */
  setResolution(width, height, sceneScale, uiScale) {
    this.resolution.width = width
    this.resolution.height = height
    this.resize()
    Mouse.resize()
    Scene.setScale(sceneScale)
    UI.setScale(uiScale)
  }

  /**
   * 缩放画布
   * @param {Object} resolution 分辨率数据对象
   */
  scaleCanvas(resolution) {
    const canvasWidth = resolution.width
    const canvasHeight = resolution.height
    const parentWidth = window.innerWidth
    const parentHeight = window.innerHeight
    const {container} = GL
    // 禁止旋转容器元素
    container.style.transform = ''
    if (canvasWidth / canvasHeight >= parentWidth / parentHeight) {
      // 如果画布宽高比大于容器宽高比，则上下留黑边
      const scaledHeight = Math.round(canvasHeight / canvasWidth * parentWidth)
      container.style.left = '0'
      container.style.top = `${parentHeight - scaledHeight >> 1}px`
      container.style.width = `${parentWidth}px`
      container.style.height = `${scaledHeight}px`
    } else {
      // 如果画布宽高比小于容器宽高比，则左右留黑边
      const scaledWidth = Math.round(canvasWidth / canvasHeight * parentHeight)
      container.style.left = `${parentWidth - scaledWidth >> 1}px`
      container.style.top = '0'
      container.style.width = `${scaledWidth}px`
      container.style.height = `${parentHeight}px`
    }
  }

  /**
   * 旋转并缩放画布
   * @param {Object} resolution 分辨率数据对象
   */
  rotateAndScaleCanvas(resolution) {
    const canvasWidth = resolution.width
    const canvasHeight = resolution.height
    const parentWidth = window.innerHeight
    const parentHeight = window.innerWidth
    const {container} = GL
    // 以左上角为锚点，旋转容器元素90度
    container.style.transformOrigin = 'left top'
    container.style.transform = 'rotate(90deg)'
    if (canvasWidth / canvasHeight >= parentWidth / parentHeight) {
      // 如果画布宽高比大于容器宽高比，则上下留黑边
      const scaledHeight = Math.round(canvasHeight / canvasWidth * parentWidth)
      container.style.left = `${parentHeight + scaledHeight >> 1}px`
      container.style.top = '0'
      container.style.width = `${parentWidth}px`
      container.style.height = `${scaledHeight}px`
    } else {
      // 如果画布宽高比小于容器宽高比，则左右留黑边
      const scaledWidth = Math.round(canvasWidth / canvasHeight * parentHeight)
      container.style.left = `${parentHeight}px`
      container.style.top = `${parentWidth - scaledWidth >> 1}px`
      container.style.width = `${scaledWidth}px`
      container.style.height = `${parentHeight}px`
    }
  }

  /** 重新调整大小事件 */
  resize() {
    const resolution = Stage.resolution
    GL.resize(resolution.width, resolution.height)
    switch (Stats.deviceType) {
      case 'pc':
        // 个人电脑模式
        Stage.scaleCanvas(resolution)
        break
      case 'mobile':
        // 移动设备模式：如果最小分辨率宽高比和窗口宽高比同时>=1或同时<1，则不用旋转
        if ((resolution.width >= resolution.height) === (window.innerWidth >= window.innerHeight)) {
          // 不旋转
          Stage.scaleCanvas(resolution)
        } else {
          // 旋转90度
          Stage.rotateAndScaleCanvas(resolution)
        }
        break
    }
  }
}