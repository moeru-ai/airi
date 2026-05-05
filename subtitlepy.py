import sys
import os
import time
import threading
from PyQt5.QtWidgets import QApplication, QWidget
from PyQt5.QtCore import Qt, QTimer, QRect
from PyQt5.QtGui import QFont, QPainter, QColor, QBrush, QFontMetrics

class SubtitleWindow(QWidget):
    def __init__(self):
        super().__init__()
        
        # ===== 修改这里：增大窗口尺寸 =====
        self.WIDTH = 1500      # 改这个值调整宽度
        self.HEIGHT = 400      # 改这个值调整高度
        self.MARGIN = 20       # 改这个值调整文本边距
        
        # 设置窗口属性
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool
        )
        
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setGeometry(100, 800, self.WIDTH, self.HEIGHT)
        
        self.text = "等待翻译..."
        
        # 字体大小（可以调整）
        self.font = QFont("Microsoft YaHei", 28)
        self.font.setBold(True)
        
        self.start_monitor()
        
        self.timer = QTimer()
        self.timer.timeout.connect(self.update)
        self.timer.start(100)
        
        self.drag_position = None
    
    # ===== 添加这个新方法：自动换行 =====
    def wrap_text(self, text, font, max_width):
        """自动换行函数"""
        if not text:
            return []
        
        font_metrics = QFontMetrics(font)
        lines = []
        current_line = ""
        
        for char in text:
            test_line = current_line + char
            if font_metrics.width(test_line) <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = char
        
        if current_line:
            lines.append(current_line)
        
        return lines
    
    def start_monitor(self):
        """启动字幕文件监控"""
        self.subtitle_file = r""#填写你的文本地址
        self.last_modified = 0
        
        def monitor():
            while True:
                if os.path.exists(self.subtitle_file):
                    mtime = os.path.getmtime(self.subtitle_file)
                    if mtime > self.last_modified:
                        try:
                            with open(self.subtitle_file, 'r', encoding='utf-8') as f:
                                new_text = f.read().strip()
                            if new_text:
                                self.text = new_text
                                print(f"[字幕] 更新: {self.text[:50]}...")
                            self.last_modified = mtime
                        except Exception as e:
                            print(f"[字幕] 读取错误: {e}")
                time.sleep(0.2)
        
        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
    
    # ===== 替换这个绘制方法：支持多行 =====
    def paintEvent(self, event):
        """绘制字幕（支持多行）"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        
        painter.setBrush(QBrush(QColor(0, 0, 0, 0)))
        painter.setPen(Qt.NoPen)
        painter.drawRect(self.rect())
        
        painter.setFont(self.font)
        
        max_width = self.WIDTH - self.MARGIN * 2
        lines = self.wrap_text(self.text, self.font, max_width)
        line_height = self.font.pointSize() + 28
        total_height = len(lines) * line_height
        start_y = (self.HEIGHT - total_height) // 2
        
        for i, line in enumerate(lines):
            y = start_y + i * line_height
            
            painter.setPen(QColor(0, 0, 0, 200))
            painter.drawText(QRect(self.MARGIN + 2, y + 2, max_width, line_height), 
                            Qt.AlignCenter, line)
            
            painter.setPen(QColor(255, 255, 255, 255))
            painter.drawText(QRect(self.MARGIN, y, max_width, line_height), 
                            Qt.AlignCenter, line)
    
    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.drag_position = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()
    
    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.LeftButton and self.drag_position:
            self.move(event.globalPos() - self.drag_position)
            event.accept()
    
    def contextMenuEvent(self, event):
        self.close()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SubtitleWindow()
    window.show()
    sys.exit(app.exec_())
