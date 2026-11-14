
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { logger } from "../../src/utils/logger.js";
import {
    checkDatabaseHealth,
    connectDatabase,
    getDatabasePoolMetrics,
    logDatabasePoolMetrics,
} from "../../src/config/database.js";

const mockPool = vi.hoisted(() => ({
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    on: vi.fn(),
    query: vi.fn(),
    connect: vi.fn(),
}));

vi.mock("pg", () => ({
    default: {
        Pool: vi.fn(function () {
            return mockPool;
        }),
    },
}));

describe("Database Pool Monitoring", () => {
    beforeEach(() => {
        mockPool.totalCount = 5;
        mockPool.idleCount = 3;
        mockPool.waitingCount = 2;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the current connection pool metrics", () => {
        expect(getDatabasePoolMetrics()).toEqual({
            totalCount: 5,
            idleCount: 3,
            waitingCount: 2,
        });
    });

    it("reflects updated connection pool metrics", () => {
        mockPool.totalCount = 8;
        mockPool.idleCount = 4;
        mockPool.waitingCount = 1;

        expect(getDatabasePoolMetrics()).toEqual({
            totalCount: 8,
            idleCount: 4,
            waitingCount: 1,
        });
    });

    it("logs informational metrics when pool utilization is normal", () => {
        const loggerSpy = vi
            .spyOn(logger, "info")
            .mockImplementation(() => {});

        const warnSpy = vi
            .spyOn(logger, "warn")
            .mockImplementation(() => {});

        const errorSpy = vi
            .spyOn(logger, "error")
            .mockImplementation(() => {});

        mockPool.totalCount = 5;
        mockPool.idleCount = 5;
        mockPool.waitingCount = 0;

        logDatabasePoolMetrics();

        expect(loggerSpy).toHaveBeenCalledWith(
            "Database connection pool metrics",
            expect.objectContaining({
                totalCount: 5,
                activeCount: 0,
                utilizationPercent: 0,
            })
        );

        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs a warning when pool utilization reaches 80 percent", () => {
        const warnSpy = vi
            .spyOn(logger, "warn")
            .mockImplementation(() => {});

        mockPool.totalCount = 10;
        mockPool.idleCount = 2;
        mockPool.waitingCount = 0;

        logDatabasePoolMetrics();

        expect(warnSpy).toHaveBeenCalledWith(
            "Database connection pool utilization is high",
            expect.objectContaining({
                totalCount: 10,
                activeCount: 8,
                utilizationPercent: 80,
            })
        );
    });

    it("logs an error when the pool is saturated", () => {
        const errorSpy = vi
            .spyOn(logger, "error")
            .mockImplementation(() => {});

        mockPool.totalCount = 10;
        mockPool.idleCount = 0;
        mockPool.waitingCount = 0;

        logDatabasePoolMetrics();

        expect(errorSpy).toHaveBeenCalledWith(
            "Database connection pool is saturated",
            expect.objectContaining({
                totalCount: 10,
                activeCount: 10,
                utilizationPercent: 100,
            })
        );
    });

    it("logs an error when requests are waiting for connections", () => {
        const errorSpy = vi
            .spyOn(logger, "error")
            .mockImplementation(() => {});

        mockPool.totalCount = 8;
        mockPool.idleCount = 0;
        mockPool.waitingCount = 2;

        logDatabasePoolMetrics();

        expect(errorSpy).toHaveBeenCalledWith(
            "Database connection pool is saturated",
            expect.objectContaining({
                totalCount: 8,
                activeCount: 8,
                waitingCount: 2,
                utilizationPercent: 80,
            })
        );
    });

    it("returns false and logs an error when the database health check fails", async () => {
        const databaseError = new Error("Database connection failed");

        mockPool.query.mockRejectedValueOnce(databaseError);

        const errorSpy = vi
            .spyOn(logger, "error")
            .mockImplementation(() => {});

        const result = await checkDatabaseHealth();

        expect(result).toBe(false);

        expect(errorSpy).toHaveBeenCalledWith(
            "Database health check failed",
            databaseError
        );
    });

    it("throws an error when the database connection cannot be established", async () => {
        const databaseError = new Error("Unable to connect to PostgreSQL");

        mockPool.connect.mockRejectedValueOnce(databaseError);

        await expect(connectDatabase()).rejects.toThrow(
            "Unable to connect to PostgreSQL"
        );
    });

    it("releases the database client when the connection check fails", async () => {
        const databaseError = new Error("Database query failed");
        const release = vi.fn();

        mockPool.connect.mockResolvedValueOnce({
            query: vi.fn().mockRejectedValueOnce(databaseError),
            release,
        });

        await expect(connectDatabase()).rejects.toThrow(
            "Database query failed"
        );

        expect(release).toHaveBeenCalledOnce();
    });
});
