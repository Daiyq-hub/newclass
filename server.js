const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');

// 加载环境变量
dotenv.config();

const app = express();
// 核心修改1：端口改为3002
const port = process.env.PORT || 3002;

// 中间件配置
app.use(cors({
  origin: '*', // 生产环境建议指定前端域名，如'http://101.35.129.174:8383'
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// 静态文件服务（托管前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// 数据库连接池（根据你的数据库配置修改）
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '你的数据库密码', // 替换为实际密码
  database: process.env.DB_NAME || 'class_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 测试数据库连接
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    connection.release();
    console.log('✅ 数据库连接成功');
  } catch (err) {
    console.error('❌ 数据库连接失败:', err.message);
    process.exit(1);
  }
}
testDbConnection();

// 1. 登录接口
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ 
      success: false, 
      error: '用户名、密码和角色为必填项' 
    });
  }

  // 测试账号
  const validUsers = [
    { username: 'admin', password: 'admin', role: 'admin', id: '1' },
    { username: 'teacher1', password: '123', role: 'teacher', id: '2' },
    { username: 'student1', password: '123', role: 'student', id: '3' }
  ];

  const user = validUsers.find(u => 
    u.username === username && u.password === password && u.role === role
  );

  if (user) {
    res.json({ 
      success: true, 
      message: '登录成功',
      user: { id: user.id, username: user.username, role: user.role }
    });
  } else {
    res.status(401).json({ 
      success: false, 
      error: '用户名、密码或角色错误' 
    });
  }
});

// 2. 仪表盘数据接口
app.get('/api/dashboard', async (req, res) => {
  try {
    // 班级成员统计
    const [members] = await pool.query(`
      SELECT COUNT(*) as total, 
             SUM(role="teacher") as teacher, 
             SUM(role="student") as student 
      FROM class_members
    `);

    // 班委会成员数
    const [committee] = await pool.query('SELECT COUNT(*) as count FROM committee');

    // 本月活动数
    const [activities] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM activities 
      WHERE DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
    `);

    // 最新留言数
    const [messages] = await pool.query('SELECT COUNT(*) as count FROM messages');

    res.json({
      totalMembers: members[0].total || 0,
      teacherCount: members[0].teacher || 0,
      studentCount: members[0].student || 0,
      committeeCount: committee[0].count || 0,
      monthlyActivities: activities[0].count || 0,
      recentMessages: messages[0].count || 0
    });
  } catch (err) {
    console.error('仪表盘数据查询错误:', err);
    res.status(500).json({ success: false, error: '查询数据失败' });
  }
});

// 3. 班级成员接口
app.get('/api/class-members', async (req, res) => {
  try {
    const { search, role } = req.query;
    let query = 'SELECT * FROM class_members WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (id LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    const [members] = await pool.query(query, params);
    res.json(members);
  } catch (err) {
    console.error('获取班级成员错误:', err);
    res.status(500).json({ success: false, error: '获取成员失败' });
  }
});

app.post('/api/class-members', async (req, res) => {
  try {
    const { id, name, role, phone, email } = req.body;

    if (!id || !name || !role) {
      return res.status(400).json({ 
        success: false, 
        error: '学号、姓名和角色为必填项' 
      });
    }

    const [existing] = await pool.query(
      'SELECT id FROM class_members WHERE id = ?',
      [id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '该学号已存在' 
      });
    }

    await pool.query(
      'INSERT INTO class_members (id, name, role, phone, email) VALUES (?, ?, ?, ?, ?)',
      [id, name, role, phone || '', email || '']
    );

    res.json({ success: true, message: '添加成功' });
  } catch (err) {
    console.error('添加班级成员错误:', err);
    res.status(500).json({ success: false, error: '添加成员失败' });
  }
});

app.delete('/api/class-members/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      'SELECT id FROM class_members WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '成员不存在' 
      });
    }

    await pool.query('DELETE FROM class_members WHERE id = ?', [id]);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除班级成员错误:', err);
    res.status(500).json({ success: false, error: '删除成员失败' });
  }
});

// 4. 班委会接口
app.get('/api/committee', async (req, res) => {
  try {
    const [members] = await pool.query('SELECT * FROM committee ORDER BY id DESC');
    res.json(members);
  } catch (err) {
    console.error('获取班委会成员错误:', err);
    res.status(500).json({ success: false, error: '获取班委会成员失败' });
  }
});

app.post('/api/committee', async (req, res) => {
  try {
    const { student_id, name, position, responsibilities } = req.body;

    if (!student_id || !name || !position) {
      return res.status(400).json({ 
        success: false, 
        error: '学号、姓名和职务为必填项' 
      });
    }

    const [existing] = await pool.query(
      'SELECT id FROM committee WHERE student_id = ?',
      [student_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '该学号已在班委会中' 
      });
    }

    await pool.query(
      'INSERT INTO committee (student_id, name, position, responsibilities) VALUES (?, ?, ?, ?)',
      [student_id, name, position, responsibilities || '']
    );

    res.json({ success: true, message: '添加成功' });
  } catch (err) {
    console.error('添加班委会成员错误:', err);
    res.status(500).json({ success: false, error: '添加班委会成员失败' });
  }
});

app.delete('/api/committee/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      'SELECT id FROM committee WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '班委会成员不存在' 
      });
    }

    await pool.query('DELETE FROM committee WHERE id = ?', [id]);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除班委会成员错误:', err);
    res.status(500).json({ success: false, error: '删除班委会成员失败' });
  }
});

// 5. 班级活动接口
app.get('/api/activities', async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    let query = 'SELECT * FROM activities WHERE 1=1';
    const params = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    const [activities] = await pool.query(query, params);
    res.json(activities);
  } catch (err) {
    console.error('获取班级活动错误:', err);
    res.status(500).json({ success: false, error: '获取班级活动失败' });
  }
});

// 班级活动统计接口
app.get('/api/activities/stats', async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT DATE_FORMAT(date, '%Y-%m') as month, COUNT(*) as count
      FROM activities
      WHERE date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY month ASC
    `);
    res.json(stats);
  } catch (err) {
    console.error('获取活动统计错误:', err);
    res.status(500).json({ success: false, error: '获取活动统计失败' });
  }
});

// 6. 值日安排接口
app.get('/api/schedules', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let query = 'SELECT * FROM schedules WHERE 1=1';
    const params = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    const [schedules] = await pool.query(query, params);
    res.json(schedules);
  } catch (err) {
    console.error('获取值日安排错误:', err);
    res.status(500).json({ success: false, error: '获取值日安排失败' });
  }
});

// 值日安排统计接口
app.get('/api/schedules/stats', async (req, res) => {
  try {
    // 获取总数量
    const [total] = await pool.query('SELECT COUNT(*) as count FROM schedules');
    const totalCount = total[0].count || 1; // 避免除以0

    // 获取各状态数量
    const [completed] = await pool.query('SELECT COUNT(*) as count FROM schedules WHERE status = "已完成"');
    const [inProgress] = await pool.query('SELECT COUNT(*) as count FROM schedules WHERE status = "进行中"');
    const [notStarted] = await pool.query('SELECT COUNT(*) as count FROM schedules WHERE status = "未开始"');

    res.json({
      completedCount: completed[0].count || 0,
      inProgressCount: inProgress[0].count || 0,
      notStartedCount: notStarted[0].count || 0,
      completedPercentage: Math.round((completed[0].count / totalCount) * 100),
      inProgressPercentage: Math.round((inProgress[0].count / totalCount) * 100),
      notStartedPercentage: Math.round((notStarted[0].count / totalCount) * 100)
    });
  } catch (err) {
    console.error('获取值日统计错误:', err);
    res.status(500).json({ success: false, error: '获取值日统计失败' });
  }
});

// 7. 留言簿接口
app.get('/api/messages', async (req, res) => {
  try {
    const [messages] = await pool.query(`
      SELECT m.*, u.username 
      FROM messages m
      LEFT JOIN (
        SELECT '1' as id, 'admin' as username UNION
        SELECT '2' as id, 'teacher1' as username UNION
        SELECT '3' as id, 'student1' as username
      ) u ON m.user_id = u.id
      ORDER BY m.created_at DESC
    `);
    res.json(messages);
  } catch (err) {
    console.error('获取留言错误:', err);
    res.status(500).json({ success: false, error: '获取留言失败' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { content, userId } = req.body;

    if (!content || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: '留言内容和用户ID为必填项' 
      });
    }

    await pool.query(
      'INSERT INTO messages (content, user_id, created_at) VALUES (?, ?, NOW())',
      [content, userId]
    );

    res.json({ success: true, message: '留言成功' });
  } catch (err) {
    console.error('添加留言错误:', err);
    res.status(500).json({ success: false, error: '留言失败' });
  }
});

// 8. 数据库初始化（核心修改2：先删旧表再重建，解决字段错误）
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // 先删除旧表（避免字段冲突）
    await connection.query('DROP TABLE IF EXISTS class_members, committee, activities, schedules, messages');
    
    // 1. 班级成员表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS class_members (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        role ENUM('teacher', 'student') NOT NULL,
        phone VARCHAR(20) DEFAULT '',
        email VARCHAR(100) DEFAULT ''
      )
    `);

    // 2. 班委会表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS committee (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        position VARCHAR(100) NOT NULL,
        responsibilities TEXT
      )
    `);

    // 3. 班级活动表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        creator VARCHAR(100) DEFAULT '',
        description TEXT
      )
    `);

    // 4. 值日安排表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        personnel VARCHAR(200) NOT NULL,
        task TEXT,
        status ENUM('未开始', '进行中', '已完成') DEFAULT '未开始'
      )
    `);

    // 5. 留言表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 插入测试数据（确保字段完全匹配）
    await connection.query(`INSERT INTO class_members (id, name, role, phone, email) VALUES 
      ('T001', '王老师', 'teacher', '13800138001', 'wang@school.com'),
      ('S001', '张三', 'student', '13900139001', 'zhang@school.com'),
      ('S002', '李四', 'student', '13700137001', 'li@school.com')`);

    await connection.query(`INSERT INTO committee (student_id, name, position, responsibilities) VALUES 
      ('S001', '张三', '班长', '负责班级日常管理'),
      ('S002', '李四', '学习委员', '负责作业收发')`);

    // 添加活动测试数据
    const today = new Date().toISOString().split('T')[0];
    await connection.query(`INSERT INTO activities (name, type, date, creator, description) VALUES 
      ('开学班会', '会议', '${today}', '王老师', '新学期安排')`);

    // 添加值日测试数据
    await connection.query(`INSERT INTO schedules (date, personnel, task, status) VALUES 
      ('${today}', '张三,李四', '打扫教室卫生', '进行中')`);

    connection.release();
    console.log('✅ 数据库表初始化完成');
  } catch (err) {
    console.error('❌ 数据库表初始化失败:', err.message);
  }
}

// 初始化数据库表
initDatabase();

// 9. 启动HTTP服务器 + WebSocket服务
const server = app.listen(port, '0.0.0.0', { reuseAddr: true }, () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${port}`);
});

// WebSocket服务配置
const wss = new WebSocket.Server({ server });

// 在线用户列表
const onlineUsers = new Map();

// 处理WebSocket连接
wss.on('connection', (ws) => {
  console.log('新的WebSocket连接');

  // 监听客户端消息
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'login':
          // 记录在线用户
          onlineUsers.set(ws, { 
            userId: message.userId, 
            username: message.username 
          });
          // 广播在线用户列表
          broadcastUserList();
          break;
          
        case 'message':
          // 广播聊天消息
          const chatMessage = {
            type: 'message',
            username: message.username,
            content: message.content,
            time: new Date().toLocaleTimeString('zh-CN', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })
          };
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(chatMessage));
            }
          });
          break;
      }
    } catch (err) {
      console.error('处理WebSocket消息错误:', err);
    }
  });

  // 连接关闭
  ws.on('close', () => {
    console.log('WebSocket连接关闭');
    // 移除离线用户
    onlineUsers.delete(ws);
    // 广播更新后的用户列表
    broadcastUserList();
  });

  // 连接错误
  ws.on('error', (err) => {
    console.error('WebSocket错误:', err);
  });
});

// 广播在线用户列表
function broadcastUserList() {
  const userList = Array.from(onlineUsers.values());
  const userListMessage = {
    type: 'userList',
    users: userList
  };
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(userListMessage));
    }
  });
}

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err.stack);
  res.status(500).json({
    success: false,
    error: '服务器内部错误'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  });
});