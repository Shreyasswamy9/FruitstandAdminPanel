// src/utils/response.ts

export const successResponse = (data: any, message: string = 'Success') => {
    return {
        status: 'success',
        message,
        data,
    };
};

export const errorResponse = (message: string, statusCode: number = 400) => {
    return {
        status: 'error',
        message,
        statusCode,
    };
};