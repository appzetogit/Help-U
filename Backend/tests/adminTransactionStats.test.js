const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getTransactionStats } = require('../controllers/adminControllers/adminTransactionController');

async function run() {
  console.log('\n--- Testing Admin Transaction Stats & Advance Payment ---');
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  try {
    const user = await User.create({
      name: 'Test Customer',
      email: 'customer@test.com',
      phone: '9999988888',
      role: 'user'
    });

    // 1. Credit transaction
    await Transaction.create({
      userId: user._id,
      amount: 500,
      type: 'credit',
      status: 'completed',
      paymentMethod: 'wallet',
      description: 'Wallet top-up'
    });

    // 2. Advance payment transaction
    await Transaction.create({
      userId: user._id,
      amount: 10000,
      type: 'advance_payment',
      status: 'completed',
      paymentMethod: 'razorpay',
      description: 'Advance payment for booking'
    });

    // 3. Refund transaction
    await Transaction.create({
      userId: user._id,
      amount: 1500,
      type: 'refund',
      status: 'completed',
      paymentMethod: 'razorpay',
      description: 'Refund for booking'
    });

    // Call getTransactionStats
    const req = { query: {} };
    let responseData = null;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
        }
      })
    };

    await getTransactionStats(req, res);

    assert(responseData && responseData.success, 'Response should be successful');
    assert.strictEqual(responseData.data.totalRevenue, 10500, 'totalRevenue should include credit (500) and advance_payment (10000)');
    assert.strictEqual(responseData.data.totalRefunds, 1500, 'totalRefunds should be 1500');
    assert.strictEqual(responseData.data.netRevenue, 9000, 'netRevenue should be 10500 - 1500 = 9000');
    console.log('  ✅ getTransactionStats correctly aggregates advance_payment as revenue');

    // Also test entity=user
    const userReq = { query: { entity: 'user' } };
    let userResponseData = null;
    const userRes = {
      status: (code) => ({
        json: (data) => {
          userResponseData = data;
        }
      })
    };
    await getTransactionStats(userReq, userRes);
    assert.strictEqual(userResponseData.data.totalRevenue, 10500, 'user totalRevenue should include advance_payment');
    console.log('  ✅ getTransactionStats correctly filters advance_payment for entity=user');

    console.log('\nAdmin Transaction Stats tests passed successfully!\n');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

