'use strict'

// ******************************** 文件系统 ********************************

const File = new class {
  // 同步加载文件映射表
  syncLoadings = new Map()

  // 加载文件Promise集合
  loadingPromises = {}

  // 加载进度
  loadingProgress = 0

  // 正在引用的二进制对象列表
  referencedBlobs = []

  // 更新数据
  update() {
    if (this.referencedBlobs.length !== 0) {
      for (const blob of this.referencedBlobs) {
        URL.revokeObjectURL(blob.url)
      }
      this.referencedBlobs.length = 0
    }
  }

  // 解密
  async decrypt({path, sync, type}) {
    const buffer = decrypt(await File.xhr({path, sync, type: 'arraybuffer'}))
    switch (type) {
      case 'url': {
        const blob = new Blob([buffer])
        const url = URL.createObjectURL(blob)
        this.referencedBlobs.push(blob)
        return blob.url = url
      }
      case 'text':
        return Codec.textDecoder.decode(buffer)
      case 'json':
        return JSON.parse(Codec.textDecoder.decode(buffer))
      case 'arraybuffer':
        return buffer
    }
  }

  /**
   * 获取文件
   * @param {Object} descriptor 文件描述器
   * @returns {Promise<Object|Image|null>}
   */
  get(descriptor) {
    // 可以指定路径或GUID来加载文件
    const path = descriptor.path ?? this.getPathByGUID(descriptor.guid)
    const sync = descriptor.sync
    const type = descriptor.type
    switch (type) {
      case 'image': {
        const {loadingPromises} = this
        // 如果当前图像已在加载中，则返回Promise，否则新建
        return loadingPromises[path] || (
        loadingPromises[path] = new Promise(async resolve => {
          const image = new Image()
          // 给图像元素设置guid用于纹理的查找
          image.guid = descriptor.guid ?? ''
          let url = path
          let callback
          if (/\.dat$/.test(path)) {
            try {
              url = await this.decrypt({path, sync, type: 'url'})
            } catch (error) {
              delete loadingPromises[path]
              return resolve(null)
            }
          } else if (sync) {
            // 同步加载图像资源
            switch (Stats.isOnClient) {
              case true: {
                // 若是本地模式运行，模拟加载进度
                const progress = {
                  complete: false,
                  lengthComputable: true,
                  loaded: 0,
                  total: 1,
                }
                this.syncLoadings.set(image, progress)
                callback = () => {
                  progress.complete = true
                  progress.loaded = 1
                }
                break
              }
              case false:
                // 若是Web模式运行，先用XHR加载数据块，再解析成图像
                // 这样可以获取加载进度，用来显示进度条
                try {
                  const blob = await File.xhr({path, sync, type: 'blob'})
                  url = blob.url = URL.createObjectURL(blob)
                  this.referencedBlobs.push(blob)
                } catch (error) {
                  delete loadingPromises[path]
                  return resolve(null)
                }
                break
            }
          }
          // 加载图像资源
          image.onload = () => {
            delete loadingPromises[path]
            image.onload = null
            image.onerror = null
            callback?.()
            resolve(image)
          }
          image.onerror = () => {
            delete loadingPromises[path]
            image.onload = null
            image.onerror = null
            image.src = ''
            callback?.()
            resolve(null)
          }
          image.src = url
        }))
      }
      default:
        return /\.dat$/.test(path)
        ? this.decrypt({path, sync, type})
        : this.xhr({path, sync, type})
    }
  }

  /**
   * 使用XHR加载文件
   * @param {Object} $
   * @param {string} $.path 文件路径
   * @param {boolean} $.sync 同步开关
   * @param {string} $.type 类型
   * @returns {Promise}
   */
  xhr({path, sync, type}) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      if (sync) {
        // 同步加载即时更新进度
        request.onloadstart =
        request.onprogress = event => {
          event.complete = false
          this.syncLoadings.set(request, event)
        }
      }
      request.onload = event => {
        event.complete = true
        this.syncLoadings.set(request, event)
        resolve(request.response)
      }
      request.onerror = event => {
        this.syncLoadings.delete(request)
        reject(request.response)
      }
      request.open('GET', path)
      request.responseType = type
      request.send()
    })
  }

  /** 获取文件路径(客户端专用) */
  route(relativePath) {
    const root = /^\$[\\\/]/
    let dirname = __dirname
    // 如果使用了根目录标记
    if (root.test(relativePath)) {
      // 如果用户使用electron-builder打包应用，重新定位到根目录
      dirname = dirname.replace(/[\\\/]resources[\\\/]app\.asar$/, '')
      relativePath = relativePath.replace(root, '')
    }
    return require('path').resolve(dirname, relativePath)
  }

  /**
   * 获取文件路径(通过GUID)
   * @param {string} guid 文件GUID
   * @returns {string} 文件路径或空字符串
   */
  getPathByGUID(guid) {
    return Data.manifest.guidMap[guid]?.path ?? ''
  }

  /**
   * 更新同步加载进度
   * @returns {boolean} 加载是否完成
   */
  updateLoadingProgress() {
    // 如果不存在同步加载，则继续
    const {syncLoadings} = this
    if (syncLoadings.size === 0) {
      return false
    }
    // 统计已加载和总的数据字节大小
    let loaded = 0
    let total = 0
    let complete = true
    for (const progress of syncLoadings.values()) {
      if (progress.lengthComputable) {
        loaded += progress.loaded
        total += progress.total
      }
      if (!progress.complete) {
        complete = false
      }
    }
    // 计算加载进度
    this.loadingProgress = loaded / (total || Infinity)
    // 加载进度为100%，不存在未知数据大小，已导入所有字体，则判定为加载完成
    if (complete && !Printer.importing.length) {
      // 删除同步加载进度表中的所有键值对
      for (const key of syncLoadings.keys()) {
        syncLoadings.delete(key)
      }
      // 移除进度条后继续
      GL.container.progress &&
      GL.container.progress.remove()
      return false
    }
    // 未加载完成
    return true
  }

  /** 渲染同步加载进度 */
  renderLoadingProgress() {
    // 擦除游戏画布内容(显示为黑屏)
    GL.clearColor(0, 0, 0, 0)
    GL.clear(GL.COLOR_BUFFER_BIT)
    // 只有Web模式下才会显示进度条
    if (!Stats.isOnClient) {
      let {progress} = GL.container
      if (!progress) {
        // 创建进度条并设置样式
        progress = document.createElement('div')
        progress.style.position = 'absolute'
        progress.style.left = '0'
        progress.style.bottom = '0'
        progress.style.height = '10px'
        progress.style.backgroundImage = `
        linear-gradient(
          to right,
          white 0%,
          white 33%,
          transparent 33%,
          transparent 100%
        )`
        progress.style.backgroundSize = '3px 1px'
        progress.style.pointerEvents = 'none'
        // 设置移除进度条方法(加载完成时调用)
        progress.remove = () => {
          GL.container.progress = null
          GL.container.removeChild(progress)
        }
        // 添加进度条到容器元素中
        GL.container.progress = progress
        GL.container.appendChild(progress)
      }
      // 更新当前的进度
      const percent = Math.round(this.loadingProgress * 100)
      if (progress.percent !== percent) {
        progress.percent = percent
        progress.style.width = `${percent}%`
      }
    }
  }
}

// ******************************** 全局唯一标识符 ********************************

const GUID = new class {
  // 检查用的正则表达式
  regExpForChecking = /[a-f]/

  /**
   * 生成32位GUID(8个字符)
   * @returns {string}
   */
  generate32bit() {
    const n = Math.random() * 0x100000000
    const s = Math.floor(n).toString(16)
    return s.length === 8 ? s : s.padStart(8, '0')
  }

  /**
   * 生成64位GUID(16个字符)
   * @returns {string}
   */
  generate64bit() {
    let id
    // GUID通常用作哈希表的键
    // 避免纯数字的键(会降低访问速度)
    do {id = this.generate32bit() + this.generate32bit()}
    while (!this.regExpForChecking.test(id))
    return id
  }
}