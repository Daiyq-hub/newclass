-- 数据库创建
CREATE DATABASE IF NOT EXISTS class_management;
USE class_management;

-- 用户表（登录用）
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(50) NOT NULL,
  role ENUM('admin', 'teacher', 'student') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 班级成员表
CREATE TABLE IF NOT EXISTS class_members (
  id VARCHAR(50) PRIMARY KEY, -- 学号/工号
  name VARCHAR(50) NOT NULL,
  role ENUM('teacher', 'student') NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 班委会表
CREATE TABLE IF NOT EXISTS committee (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL, -- 关联class_members.id
  position VARCHAR(50) NOT NULL, -- 职务
  responsibilities TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES class_members(id) ON DELETE CASCADE
);

-- 值日安排表
CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  personnel VARCHAR(200) NOT NULL, -- 值日人员，逗号分隔
  task TEXT, -- 任务描述
  status ENUM('未开始', '进行中', '已完成') DEFAULT '未开始',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 班级活动表
CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL, -- 活动名称
  date DATE NOT NULL,
  type VARCHAR(50) NOT NULL, -- 活动类型
  description TEXT, -- 活动详情
  created_by INT NOT NULL, -- 关联users.id
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 留言表
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  content TEXT NOT NULL,
  user_id INT NOT NULL, -- 关联users.id
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 初始化管理员用户（密码：123456）
INSERT IGNORE INTO users (username, password, role) VALUES ('admin', '123456', 'admin');